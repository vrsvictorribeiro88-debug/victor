/**
 * LinkedInPublisher — Agent 7
 * Publishes approved posts via LinkedIn API v2 (Marketing Developer Platform).
 * Handles text-only posts and posts with images.
 */

import 'dotenv/config';
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import FormData from 'form-data';
import { info, success, warn, error } from '../skills/logger.js';
import { updateDraft } from '../skills/storage.js';

const AGENT = 'linkedinPublisher';
const LINKEDIN_API = 'https://api.linkedin.com/v2';

function getHeaders() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

export async function run(draft) {
  if (!draft?.postCopy) throw new Error('LinkedInPublisher requires a draft with postCopy');
  if (draft.status !== 'APPROVED') {
    warn(AGENT, `Draft ${draft.id} is not APPROVED — status is ${draft.status}`);
    throw new Error(`Cannot publish draft with status: ${draft.status}`);
  }

  info(AGENT, `Publishing draft: ${draft.id}`, { chars: draft.charCount, hasImage: !!draft.image?.localPath });

  if (process.env.DRY_RUN === 'true') {
    warn(AGENT, '[DRY_RUN] Skipping LinkedIn publish');
    const mockResult = { postId: 'urn:li:share:DRY_RUN', url: 'https://linkedin.com/feed/DRY_RUN' };
    updateDraft(draft.id, { status: 'PUBLISHED', publishResult: mockResult, publishedAt: new Date().toISOString() });
    return mockResult;
  }

  const personUrn = process.env.LINKEDIN_PERSON_URN;
  if (!personUrn) throw new Error('LINKEDIN_PERSON_URN not set');

  let imageAsset = null;
  if (draft.image?.localPath && existsSync(draft.image.localPath)) {
    imageAsset = await uploadImage(draft.image.localPath, personUrn);
  }

  const postBody = buildPostBody(draft, personUrn, imageAsset);
  info(AGENT, 'Submitting post to LinkedIn API');

  let response;
  try {
    response = await axios.post(`${LINKEDIN_API}/ugcPosts`, postBody, { headers: getHeaders() });
  } catch (err) {
    error(AGENT, 'LinkedIn API error', {
      status: err.response?.status,
      data: err.response?.data,
    });
    throw new Error(`LinkedIn publish failed: ${err.response?.data?.message || err.message}`);
  }

  const postId = response.data.id || response.headers['x-restli-id'];
  const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

  const publishResult = { postId, url: postUrl, publishedAt: new Date().toISOString() };
  updateDraft(draft.id, { status: 'PUBLISHED', publishResult, publishedAt: publishResult.publishedAt });
  success(AGENT, `Post published successfully`, { postId, url: postUrl });
  return publishResult;
}

function buildPostBody(draft, personUrn, imageAsset) {
  const body = {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: draft.postCopy },
        shareMediaCategory: imageAsset ? 'IMAGE' : 'NONE',
        media: imageAsset ? [{ status: 'READY', description: { text: draft.image?.brief?.altText || '' }, media: imageAsset, title: { text: draft.pick?.title || '' } }] : undefined,
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };
  return body;
}

async function uploadImage(imagePath, personUrn) {
  info(AGENT, 'Uploading image to LinkedIn');

  const registerResponse = await axios.post(
    `${LINKEDIN_API}/assets?action=registerUpload`,
    {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: personUrn,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    },
    { headers: getHeaders() },
  );

  const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const assetId = registerResponse.data.value.asset;

  const imageData = readFileSync(imagePath);
  await axios.put(uploadUrl, imageData, {
    headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`, 'Content-Type': 'image/png' },
  });

  info(AGENT, 'Image uploaded successfully', { assetId });
  return assetId;
}

export async function getProfileInfo() {
  const response = await axios.get(`${LINKEDIN_API}/me`, { headers: getHeaders() });
  return response.data;
}

if (process.argv[1].endsWith('linkedinPublisher.js')) {
  getProfileInfo().then((profile) => {
    console.log('\n=== LinkedIn Profile ===');
    console.log(`ID: ${profile.id}`);
    console.log(`Name: ${profile.localizedFirstName} ${profile.localizedLastName}`);
    console.log(`URN: urn:li:person:${profile.id}`);
  }).catch(console.error);
}
