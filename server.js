const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve frontend HTML directly
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JP Player</title>
    <style>
        :root {
            --bg-main: #0b0f19;
            --surface-bg: rgba(30, 41, 59, 0.5);
            --surface-border: rgba(255, 255, 255, 0.08);
            --input-bg: rgba(15, 23, 42, 0.7);
            --accent-red: #ef4444;
            --accent-blue: #38bdf8;
            --accent-green: #10b981;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: radial-gradient(circle at top center, #1e1b4b 0%, var(--bg-main) 70%);
            color: var(--text-main); 
            min-height: 100vh;
            display: flex;
            justify-content: center;
        }
        .page-wrapper {
            width: 100%;
            max-width: 1000px;
            padding: 40px 24px;
            display: flex;
            flex-direction: column;
            gap: 28px;
        }
        .header { text-align: center; margin-bottom: 8px; }
        h2 { font-size: 32px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.5px; }
        .subtitle { font-size: 15px; color: var(--text-muted); }
        .search-surface { 
            display: flex; 
            gap: 12px; 
            background: var(--surface-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--surface-border);
            padding: 12px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        input[type="text"] { 
            flex: 1; 
            padding: 16px; 
            border-radius: 12px; 
            border: 1px solid var(--surface-border); 
            background: var(--input-bg); 
            color: var(--text-main); 
            font-size: 15px; 
            outline: none;
        }
        input[type="text"]:focus { border-color: var(--accent-blue); }
        .fetch-btn { 
            padding: 16px 32px; 
            border: none; 
            border-radius: 12px; 
            background: var(--accent-red); 
            color: #fff; 
            font-weight: 600; 
            cursor: pointer; 
            font-size: 15px;
            transition: opacity 0.2s;
        }
        .fetch-btn:hover { opacity: 0.9; }
        .video-surface { 
            display: none; 
            grid-template-columns: 340px 1fr;
            gap: 24px;
            align-items: start;
        }
        .media-left { 
            background: var(--surface-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--surface-border);
            padding: 20px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .thumb-wrapper { border-radius: 12px; overflow: hidden; margin-bottom: 14px; }
        .media-left img { width: 100%; display: block; }
        .video-title { font-size: 15px; font-weight: 600; line-height: 1.4; }
        .controls-right { 
            background: var(--surface-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--surface-border);
            padding: 24px;
            border-radius: 16px;
            display: flex; 
            flex-direction: column; 
            gap: 20px; 
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .section-label { 
            font-size: 12px; 
            color: var(--text-muted); 
            margin-bottom: 8px; 
            display: block; 
            text-transform: uppercase; 
            font-weight: 700; 
            letter-spacing: 0.5px;
        }
        .format-tabs { display: flex; gap: 6px; background: var(--input-bg); padding: 6px; border-radius: 12px; }
        .tab-btn { 
            flex: 1; 
            padding: 12px; 
            border: none; 
            background: transparent; 
            color: var(--text-muted); 
            font-weight: 600; 
            cursor: pointer; 
            border-radius: 8px; 
            transition: all 0.2s;
        }
        .tab-btn.active { background: var(--accent-blue); color: #0f172a; }
        .select-box { 
            width: 100%; 
            padding: 14px; 
            border-radius: 10px; 
            border: 1px solid var(--surface-border); 
            background: var(--input-bg); 
            color: var(--text-main); 
            font-size: 14px;
            outline: none;
        }
        .download-btn { 
            width: 100%; 
            padding: 16px; 
            border: none; 
            border-radius: 12px; 
            background: var(--accent-green); 
            color: #fff; 
            font-weight: 700; 
            font-size: 15px;
            cursor: pointer; 
            transition: opacity 0.2s;
        }
        .download-btn:disabled { background: #334155; cursor: not-allowed; }
        .progress-box { 
            display: none; 
            position: relative; 
            margin-top: 10px; 
            padding: 18px; 
            background: var(--input-bg); 
            border: 1px solid var(--surface-border); 
            border-radius: 12px; 
            flex-direction: column; 
            gap: 12px; 
        }
        .progress-top-row { display: flex; justify-content: space-between; align-items: center; }
        .progress-status-title { font-size: 13px; font-weight: 600; color: var(--text-main); }
        .progress-top-right { display: flex; align-items: center; gap: 12px; }
        .mb-downloaded { font-size: 13px; font-weight: 600; color: var(--accent-blue); }
        .cancel-btn { background: transparent; border: none; color: var(--text-muted); font-size: 18px; font-weight: 700; cursor: pointer; padding: 0 4px; line-height: 1; }
        .cancel-btn:hover { color: var(--accent-red); }
        .progress-bar-bg { width: 100%; height: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; overflow: hidden; }
        .progress-bar-fill { height: 100%; width: 0%; background: var(--accent-blue); transition: width 0.2s; }
        .progress-center-percent { text-align: center; font-size: 14px; font-weight: 700; color: var(--text-main); }
        .brand-footer { text-align: center; font-size: 14px; font-weight: 600; color: var(--text-muted); margin-top: 12px; letter-spacing: 0.5px; }
        .brand-glow { color: #ff2a85; font-weight: 600; display: inline-block; animation: textGlow 1.8s infinite ease-in-out; }
        @keyframes textGlow {
            28% { text-shadow: 0 0 2px rgba(255, 42, 133, 0.4), 0 0 8px rgba(255, 42, 133, 0.2); }
            42% { text-shadow: 0 0 4px rgba(255, 42, 133, 0.8), 0 0 16px rgba(255, 42, 133, 0.6); }
        }
        @media (max-width: 768px) {
            .video-surface { grid-template-columns: 1fr; }
            .search-surface { flex-direction: column; }
            .fetch-btn { width: 100%; }
        }
    </style>
</head>
<body>
<div class="page-wrapper">
    <div class="header">
        <h2>JP Player Downloader</h2>
        <div class="subtitle">Convert and download videos or high-quality audio</div>
    </div>
    <div class="search-surface">
        <input type="text" id="ytUrl" placeholder="Paste video link here..." />
        <button id="fetchBtn" class="fetch-btn" onclick="fetchVideoInfo()">Convert</button>
    </div>
    <div id="videoSurface" class="video-surface">
        <div class="media-left">
            <div class="thumb-wrapper">
                <img id="thumb" src="" alt="Thumbnail" />
            </div>
            <div id="videoTitle" class="video-title"></div>
        </div>
        <div class="controls-right">
            <div>
                <span class="section-label">Format</span>
                <div class="format-tabs">
                    <button id="tabMp4" class="tab-btn active" onclick="setMode('mp4')">🎬 Video (MP4)</button>
                    <button id="tabMp3" class="tab-btn" onclick="setMode('mp3')">🎵 Audio (MP3)</button>
                </div>
            </div>
            <div id="videoQualityGroup">
                <span class="section-label">Video Quality</span>
                <select id="mp4Quality" class="select-box"></select>
            </div>
            <div id="audioQualityGroup" style="display: none;">
                <span class="section-label">Audio Quality</span>
                <select id="mp3Bitrate" class="select-box">
                    <option value="320">320 kbps (High Quality)</option>
                    <option value="192" selected>192 kbps (Standard)</option>
                    <option value="128">128 kbps (Low Quality)</option>
                </select>
            </div>
            <button id="downloadBtn" class="download-btn" onclick="startDownload()">Download</button>
            <div id="progressBox" class="progress-box">
                <div class="progress-top-row">
                    <span id="progressStatus" class="progress-status-title">Downloading...</span>
                    <div class="progress-top-right">
                        <span id="mbDownloaded" class="mb-downloaded">0 MB / --</span>
                        <button class="cancel-btn" title="Cancel Download" onclick="cancelDownload()">✕</button>
                    </div>
                </div>
                <div class="progress-bar-bg">
                    <div id="progressFill" class="progress-bar-fill"></div>
                </div>
                <div id="progressPercent" class="progress-center-percent">0%</div>
            </div>
        </div>
    </div>
    <div class="brand-footer">
        Powered by <span class="brand-glow">JP Player</span>
    </div>
</div>
<script>
    let activeVideo = {};
    let currentMode = 'mp4';
    let currentEventSource = null;

    async function fetchVideoInfo() {
        const url = document.getElementById('ytUrl').value.trim();
        if (!url) return alert('Please enter a URL');

        const fetchBtn = document.getElementById('fetchBtn');
        fetchBtn.innerText = 'Converting...';
        fetchBtn.disabled = true;

        try {
            const res = await fetch(\`/api/info?url=\${encodeURIComponent(url)}\`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            activeVideo = { url, title: data.title };
            document.getElementById('thumb').src = data.thumbnail;
            document.getElementById('videoTitle').innerText = data.title;

            const select = document.getElementById('mp4Quality');
            select.innerHTML = '';
            
            if (data.qualities && data.qualities.length > 0) {
                data.qualities.forEach(q => {
                    const option = document.createElement('option');
                    option.value = q.height;
                    option.innerText = q.label;
                    select.appendChild(option);
                });
            } else {
                select.innerHTML = '<option value="1080">1080p (FHD)</option><option value="720">720p (HD)</option>';
            }

            document.getElementById('videoSurface').style.display = 'grid';
        } catch (err) {
            alert(err.message || 'Could not convert video metadata');
        } finally {
            fetchBtn.innerText = 'Convert';
            fetchBtn.disabled = false;
        }
    }

    function setMode(mode) {
        currentMode = mode;
        if (mode === 'mp4') {
            document.getElementById('tabMp4').classList.add('active');
            document.getElementById('tabMp3').classList.remove('active');
            document.getElementById('videoQualityGroup').style.display = 'block';
            document.getElementById('audioQualityGroup').style.display = 'none';
        } else {
            document.getElementById('tabMp3').classList.add('active');
            document.getElementById('tabMp4').classList.remove('active');
            document.getElementById('videoQualityGroup').style.display = 'none';
            document.getElementById('audioQualityGroup').style.display = 'block';
        }
    }

    function startDownload() {
        const height = document.getElementById('mp4Quality').value;
        const bitrate = document.getElementById('mp3Bitrate').value;
        const downloadBtn = document.getElementById('downloadBtn');
        const progressBox = document.getElementById('progressBox');
        const progressFill = document.getElementById('progressFill');
        const progressStatus = document.getElementById('progressStatus');
        const progressPercent = document.getElementById('progressPercent');
        const mbDownloaded = document.getElementById('mbDownloaded');

        downloadBtn.disabled = true;
        progressBox.style.display = 'flex';
        progressFill.style.width = '0%';
        progressStatus.innerText = 'Downloading...';
        progressPercent.innerText = '0%';
        mbDownloaded.innerText = '0 MB / --';

        const sseUrl = \`/api/process-stream?url=\${encodeURIComponent(activeVideo.url)}&title=\${encodeURIComponent(activeVideo.title)}&format=\${currentMode}&height=\${height}&bitrate=\${bitrate}\`;
        currentEventSource = new EventSource(sseUrl);

        currentEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.status === 'downloading') {
                progressFill.style.width = \`\${data.percent}%\`;
                progressPercent.innerText = \`\${data.percent.toFixed(1)}%\`;
                
                if (data.totalMb && data.totalMb !== '--') {
                    mbDownloaded.innerText = \`\${data.downloadedMb} / \${data.totalMb}\`;
                } else {
                    mbDownloaded.innerText = \`\${data.downloadedMb}\`;
                }
            } else if (data.status === 'complete') {
                currentEventSource.close();
                currentEventSource = null;
                progressStatus.innerText = 'Complete! Saving file...';
                progressFill.style.width = '100%';
                progressPercent.innerText = '100%';

                window.location.href = \`/api/get-file?fileId=\${data.fileId}\`;

                setTimeout(() => {
                    downloadBtn.disabled = false;
                    progressBox.style.display = 'none';
                }, 3000);
            } else if (data.status === 'error') {
                currentEventSource.close();
                currentEventSource = null;
                alert('Download failed.');
                downloadBtn.disabled = false;
                progressBox.style.display = 'none';
            }
        };

        currentEventSource.onerror = () => {
            if (currentEventSource) {
                currentEventSource.close();
                currentEventSource = null;
            }
            downloadBtn.disabled = false;
        };
    }

    function cancelDownload() {
        if (currentEventSource) {
            currentEventSource.close();
            currentEventSource = null;
        }
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('progressBox').style.display = 'none';
    }
</script>
</body>
</html>`);
});

// API Route: Metadata Fetcher
app.get('/api/info', (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'Missing URL' });

    const args = ['--dump-json', '--no-warnings', '--no-check-certificates', videoUrl];
    const child = spawn('yt-dlp', args);

    let dataString = '';
    child.stdout.on('data', (chunk) => { dataString += chunk; });

    child.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({ error: 'Failed to retrieve video metadata' });
        }
        try {
            const info = JSON.parse(dataString);
            const heights = new Set();
            if (info.formats) {
                info.formats.forEach(f => {
                    if (f.height && f.vcodec !== 'none') heights.add(f.height);
                });
            }
            const sortedHeights = Array.from(heights).sort((a, b) => b - a);
            const qualities = sortedHeights.map(h => ({
                height: h,
                label: `${h}p${h >= 1080 ? '(FHD)' : h >= 720 ? '(HD)' : '(SD)'}`
            }));

            res.json({
                title: info.title,
                thumbnail: info.thumbnail,
                qualities: qualities
            });
        } catch (e) {
            res.status(500).json({ error: 'Parsing error' });
        }
    });
});

// API Route: Real-time SSE download and merge progress tracker
app.get('/api/process-stream', (req, res) => {
    const { url, format, height, bitrate } = req.query;
    if (!url) return res.status(400).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-align');

    const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const uniqueId = Date.now();
    const outputExt = format === 'mp3' ? 'mp3' : 'mp4';
    const outputTemplate = path.join(os.tmpdir(), `file_${uniqueId}.${outputExt}`);

    let args = [
        '--no-check-certificates',
        '--no-warnings',
        '-o', outputTemplate
    ];

    if (format === 'mp3') {
        args.push('-x', '--audio-format', 'mp3', '--audio-quality', `${bitrate}K`);
    } else {
        const targetHeight = height || '1080';
        args.push('-f', `bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]`, '--merge-output-format', 'mp4');
    }

    args.push(url);

    const child = spawn('yt-dlp', args);

    child.stdout.on('data', (data) => {
        const line = data.toString();
        const match = line.match(/(\d+\.\d+)%\s+of\s+~?\s*([\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)/);
        if (match) {
            const percent = parseFloat(match[1]);
            const totalMb = match[2];
            const downloadedMb = match[3];
            sendSSE({ status: 'downloading', percent, totalMb, downloadedMb });
        }
    });

    child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputTemplate)) {
            sendSSE({ status: 'complete', fileId: uniqueId });
        } else {
            sendSSE({ status: 'error' });
        }
        res.end();
    });

    req.on('close', () => {
        child.kill();
    });
});

// API Route: Deliver finished file download
app.get('/api/get-file', (req, res) => {
    const fileId = req.query.fileId;
    if (!fileId) return res.status(400).send('Missing file ID');

    const tmpDir = os.tmpdir();
    const files = fs.readdirSync(tmpDir);
    const targetFile = files.find(f => f.startsWith(`file_${fileId}`));

    if (!targetFile) return res.status(404).send('File not found or expired.');

    const filePath = path.join(tmpDir, targetFile);
    res.download(filePath, targetFile.replace(/^file_\d+_?/, ''), (err) => {
        setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch(e){}
        }, 10000);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 JP Player Web running on port ${PORT}`);
});