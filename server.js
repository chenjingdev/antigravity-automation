#!/usr/bin/env node
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT);
const API_KEY = process.env.API_KEY;
const SCRIPT_PATH = process.env.SCRIPT_PATH;
const OUTPUT_DIR_IMAGE = process.env.OUTPUT_DIR_IMAGE;
const OUTPUT_DIR_TEXT = process.env.OUTPUT_DIR_TEXT;
const HISTORY_DIR =
  process.env.HISTORY_DIR ||
  path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'User', 'History');
const USE_HISTORY_TEXT = process.env.USE_HISTORY_TEXT === '1';
const DEFAULT_TIMEOUT_MS = Number(process.env.TIMEOUT_MS);
const DEFAULT_POLL_MS = Number(process.env.POLL_INTERVAL_MS);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 60 * 60 * 1000);

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const TEXT_EXTS = new Set(['.txt', '.md', '.json']);

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function runScript(prompt, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(SCRIPT_PATH, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(stderr || `Script exited with code ${code}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function findNewestFileSince(startMs, exts, dir) {
  const entries = await fs.promises.readdir(dir);
  let newest = null;
  for (const name of entries) {
    const filePath = path.join(dir, name);
    let st;
    try {
      st = await fs.promises.stat(filePath);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    if (exts && exts.size && !exts.has(ext)) continue;
    if (st.mtimeMs <= startMs) continue;
    if (!newest || st.mtimeMs > newest.mtimeMs) {
      newest = { path: filePath, name, mtimeMs: st.mtimeMs };
    }
  }
  return newest;
}

async function waitForFile({ startMs, exts, timeoutMs, pollMs, dir }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const newest = await findNewestFileSince(startMs, exts, dir);
    if (newest) return newest;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

async function findNewestHistorySince(startMs, historyDir) {
  let newest = null;
  let entries;
  try {
    entries = await fs.promises.readdir(historyDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const base = path.join(historyDir, dirent.name);
    const entriesPath = path.join(base, 'entries.json');
    let data;
    try {
      data = JSON.parse(await fs.promises.readFile(entriesPath, 'utf8'));
    } catch {
      // Some history folders only contain txt files; fall back to mtime scan.
      let files;
      try {
        files = await fs.promises.readdir(base);
      } catch {
        continue;
      }
      for (const name of files) {
        const ext = path.extname(name).toLowerCase();
        if (!TEXT_EXTS.has(ext)) continue;
        const txtPath = path.join(base, name);
        let st;
        try {
          st = await fs.promises.stat(txtPath);
        } catch {
          continue;
        }
        if (!st.isFile()) continue;
        if (st.mtimeMs <= startMs) continue;
        if (!newest || st.mtimeMs > newest.timestamp) {
          newest = { path: txtPath, name: path.basename(txtPath), timestamp: st.mtimeMs };
        }
      }
      continue;
    }
    if (!Array.isArray(data.entries)) continue;
    for (const entry of data.entries) {
      if (!entry || typeof entry.timestamp !== 'number' || typeof entry.id !== 'string') continue;
      if (entry.timestamp <= startMs) continue;
      const txtPath = path.join(base, entry.id);
      let st;
      try {
        st = await fs.promises.stat(txtPath);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (!newest || entry.timestamp > newest.timestamp) {
        newest = { path: txtPath, name: path.basename(txtPath), timestamp: entry.timestamp };
      }
    }
  }
  return newest;
}

async function waitForHistory({ startMs, timeoutMs, pollMs, historyDir }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const newest = await findNewestHistorySince(startMs, historyDir);
    if (newest) return newest;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

function pickExts(type) {
  if (type === 'image') return IMAGE_EXTS;
  if (type === 'text') return TEXT_EXTS;
  return null; // accept any
}

function detectMimeByExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function makeJobId() {
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

const jobs = new Map();
const claimedHistoryPaths = new Set();
const claimedOutputFiles = new Set();

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.startMs > JOB_TTL_MS) jobs.delete(id);
  }
}

async function ensurePrereqs() {
  if (!PORT || Number.isNaN(PORT)) {
    throw new Error('PORT not configured');
  }
  if (!API_KEY) {
    throw new Error('API_KEY not configured');
  }
  if (!SCRIPT_PATH) {
    throw new Error('SCRIPT_PATH not configured');
  }
  if (!OUTPUT_DIR_IMAGE || !OUTPUT_DIR_TEXT) {
    throw new Error('OUTPUT_DIR_IMAGE/OUTPUT_DIR_TEXT not configured');
  }
  if (!DEFAULT_TIMEOUT_MS || !DEFAULT_POLL_MS) {
    throw new Error('TIMEOUT_MS/POLL_INTERVAL_MS not configured');
  }
  try {
    await fs.promises.access(SCRIPT_PATH, fs.constants.X_OK);
  } catch {
    throw new Error(`Script not executable: ${SCRIPT_PATH}`);
  }
  await fs.promises.mkdir(OUTPUT_DIR_IMAGE, { recursive: true });
  await fs.promises.mkdir(OUTPUT_DIR_TEXT, { recursive: true });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true });
  }

  if (!API_KEY) {
    return json(res, 500, { error: 'API_KEY not configured' });
  }

  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  if (req.method === 'GET' && req.url && req.url.startsWith('/result/')) {
    const jobId = req.url.split('/').pop();
    if (!jobId || !jobs.has(jobId)) {
      return json(res, 404, { error: 'Unknown jobId' });
    }
    const job = jobs.get(jobId);
    cleanupJobs();

    if (job.status === 'error') {
      return json(res, 500, { error: job.error || 'Job failed' });
    }
    if (job.status === 'done') {
      return json(res, 200, job.result);
    }
    if (Date.now() - job.startMs > job.timeoutMs) {
      job.status = 'error';
      job.error = 'Timed out waiting for output';
      return json(res, 408, { error: job.error });
    }

    let file = null;
    if (job.expectedPath) {
      let st;
      try {
        st = await fs.promises.stat(job.expectedPath);
      } catch {
        st = null;
      }
      if (st && st.isFile()) {
        if (path.extname(job.expectedPath).toLowerCase() === '.json') {
          let raw;
          try {
            raw = await fs.promises.readFile(job.expectedPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.jobId === job.jobId && typeof parsed.text === 'string') {
              file = {
                path: job.expectedPath,
                name: path.basename(job.expectedPath),
                _embeddedText: parsed.text,
                _fixed: true,
              };
            }
          } catch {
            file = null;
          }
        } else {
          file = { path: job.expectedPath, name: path.basename(job.expectedPath) };
        }
      }
      if (file && !file._fixed && claimedOutputFiles.has(file.path)) {
        file = null;
      }
    }
    if (!file && job.outputType === 'text' && USE_HISTORY_TEXT) {
      file = await findNewestHistorySince(job.startMs, HISTORY_DIR);
      if (file && claimedHistoryPaths.has(file.path)) {
        file = null;
      }
    }
    if (!file) {
      const exts = pickExts(job.outputType);
      file = await findNewestFileSince(job.startMs, exts, job.outputDir);
      if (file && claimedOutputFiles.has(file.path)) {
        file = null;
      }
    }

    if (!file) {
      return json(res, 202, { ok: false, status: 'pending', jobId });
    }

    if (!file._fixed && job.outputType === 'text' && USE_HISTORY_TEXT) {
      claimedHistoryPaths.add(file.path);
    } else if (!file._fixed) {
      claimedOutputFiles.add(file.path);
    }

    let data;
    try {
      if (file._embeddedText !== undefined) {
        data = Buffer.from(file._embeddedText, 'utf8');
      } else {
        data = await fs.promises.readFile(file.path);
      }
    } catch (e) {
      if (!file._fixed && job.outputType === 'text' && USE_HISTORY_TEXT) {
        claimedHistoryPaths.delete(file.path);
      } else if (!file._fixed) {
        claimedOutputFiles.delete(file.path);
      }
      return json(res, 500, { error: `Failed to read output file: ${e.message}` });
    }

    const mime = detectMimeByExt(file.name);
    const payload = {
      ok: true,
      jobId,
      outputType: job.outputType,
      filename: file.name,
      mime,
      bytes: data.length,
      base64: data.toString('base64'),
    };
    if (job.outputType === 'text') {
      payload.text = data.toString('utf8');
    }

    job.status = 'done';
    job.result = payload;
    return json(res, 200, payload);
  }

  if (req.method !== 'POST' || (req.url !== '/' && req.url !== '/send')) {
    return json(res, 404, { error: 'Not found' });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return json(res, 400, { error: e.message });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) {
    return json(res, 400, { error: 'prompt is required' });
  }

  const outputType = body.outputType === 'image' || body.outputType === 'text' ? body.outputType : '';
  if (!outputType) {
    return json(res, 400, { error: 'outputType must be "image" or "text"' });
  }
  const timeoutMs = Number(body.timeoutMs || DEFAULT_TIMEOUT_MS);
  const pollMs = Number(body.pollIntervalMs || DEFAULT_POLL_MS);
  const outputDir = outputType === 'image' ? OUTPUT_DIR_IMAGE : OUTPUT_DIR_TEXT;

  const jobId = makeJobId();
  const expectedPath =
    outputType === 'text' ? path.join(OUTPUT_DIR_TEXT, 'result.json') : null;
  const startMs = Date.now();
  const finalPrompt = JSON.stringify({ type: outputType, jobId, prompt });

  try {
    await ensurePrereqs();
    cleanupJobs();
    if (expectedPath) {
      let data = { jobId, text: '' };
      try {
        const content = await fs.promises.readFile(expectedPath, 'utf8');
        const loaded = JSON.parse(content);
        if (loaded && typeof loaded === 'object') {
          data = { ...loaded, jobId, text: '' };
        }
      } catch (e) {
        // Ignore read errors, use seed
      }
      await fs.promises.writeFile(expectedPath, JSON.stringify(data, null, 2), 'utf8');
    }
    jobs.set(jobId, {
      jobId,
      prompt: finalPrompt,
      outputType,
      outputDir,
      expectedPath,
      startMs,
      timeoutMs,
      pollMs,
      status: 'pending',
    });
    runScript(finalPrompt, {
      JOB_ID: jobId,
      OUTPUT_PATH: expectedPath || '',
      OUTPUT_TYPE: outputType,
    })
      .then(() => { })
      .catch((e) => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = 'error';
          job.error = e.message || 'Script failed';
        }
      });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
  return json(res, 202, { ok: true, status: 'accepted', jobId });
});

server.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
