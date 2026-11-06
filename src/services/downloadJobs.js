const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeZip } = require('./zipArchive');

const jobs = new Map();
const TTL = 15 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status === 'downloading') continue;
    if (now - job.createdAt < TTL) continue;
    jobs.delete(id);
    if (job.filePath) fs.promises.unlink(job.filePath).catch(() => {});
  }
}

function publicJob(job) {
  return {
    status: job.status,
    done: job.done,
    total: job.total,
    current: job.current,
    bytes: job.bytes,
    error: job.error
  };
}

function createDownloadJob({ userId, folders }) {
  sweep();
  const id = crypto.randomBytes(16).toString('hex');
  const job = {
    id,
    userId,
    status: 'preparing',
    done: 0,
    total: 0,
    current: '正在统计文件',
    bytes: 0,
    error: '',
    filePath: '',
    createdAt: Date.now()
  };
  jobs.set(id, job);
  runJob(job, folders);
  return job;
}

async function runJob(job, folders) {
  const filePath = path.join(os.tmpdir(), `static-host-${job.id}.zip`);
  job.filePath = filePath;
  const stream = fs.createWriteStream(filePath);
  try {
    await writeZip(stream, folders, (progress) => {
      job.status = progress.current === '正在统计文件' ? 'preparing' : 'packing';
      job.done = progress.done;
      job.total = progress.total;
      job.current = progress.current;
    });
    const stat = await fs.promises.stat(filePath);
    job.bytes = stat.size;
    job.status = 'ready';
    job.done = job.total;
    job.current = '';
  } catch (error) {
    job.status = 'error';
    job.error = error.message || '打包失败';
    stream.destroy();
    fs.promises.unlink(filePath).catch(() => {});
  }
}

function getDownloadJob(id, userId) {
  const job = jobs.get(String(id || ''));
  if (!job || job.userId !== userId) return null;
  return job;
}

module.exports = { createDownloadJob, getDownloadJob, publicJob };
