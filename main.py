import os
import re
import uuid
import json
import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import yt_dlp

app = FastAPI()

# Setup paths using pathlib for absolute safety across platforms
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DOWNLOAD_DIR = BASE_DIR / "downloads"

STATIC_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount static folder for frontend files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        with open(index_file, "r", encoding="utf-8") as f:
            return f.read()
    raise HTTPException(status_code=404, detail="index.html not found in static folder.")

@app.get("/api/info")
async def get_video_info(url: str):
    """Extracts title, thumbnail, and available resolutions for the video."""
    try:
        ydl_opts = {
            'quiet': True,
            'js_runtimes': {'deno': {}},  # Fixed syntax: nested dictionary format
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            qualities = []
            seen_heights = set()
            
            for f in info.get('formats', []):
                if f.get('vcodec') != 'none' and f.get('height'):
                    h = f['height']
                    if h not in seen_heights and h >= 144:
                        seen_heights.add(h)
                        label = f"{h}p"
                        if h >= 1080:
                            label += " (FHD)"
                        elif h >= 720:
                            label += " (HD)"
                        elif h >= 480:
                            label += " (SD)"
                        
                        qualities.append({'height': h, 'label': label})
            
            qualities = sorted(qualities, key=lambda x: x['height'], reverse=True)
            
            return {
                "title": info.get('title', 'Unknown Video'),
                "thumbnail": info.get('thumbnail', ''),
                "qualities": qualities
            }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/process-stream")
async def process_stream(url: str, title: str, format: str, height: str = "720p", bitrate: str = "192"):
    """Streams live download progress updates back to the browser via SSE."""
    file_id = str(uuid.uuid4())
    
    # Corrected nested dictionary configuration for JS runtimes
    base_ydl_opts = {
        'js_runtimes': {'deno': {}},  # Change to {'node': {}} if using Node.js
    }
    
    if format == 'mp4':
        target_height = height.replace('p', '')
        ydl_opts = {
            **base_ydl_opts,
            'format': f"bestvideo[height<={target_height}]+bestaudio/best[height<={target_height}]/best",
            'outtmpl': str(DOWNLOAD_DIR / f"{file_id}.%(ext)s"),
            'merge_output_format': 'mp4',
        }
    else:
        ydl_opts = {
            **base_ydl_opts,
            'format': 'bestaudio/best',
            'outtmpl': str(DOWNLOAD_DIR / f"{file_id}.%(ext)s"),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': bitrate,
            }],
        }

    async def event_generator():
        loop = asyncio.get_running_loop()
        queue = asyncio.Queue()

        def sync_hook(d):
            loop.call_soon_threadsafe(queue.put_nowait, d)

        ydl_opts['progress_hooks'] = [sync_hook]

        # Run yt-dlp download in a separate thread to prevent blocking FastAPI's loop
        loop_task = loop.run_in_executor(
            None, lambda: run_download(ydl_opts, url)
        )

        try:
            while not loop_task.done():
                try:
                    d = await asyncio.wait_for(queue.get(), timeout=0.5)
                    if d['status'] == 'downloading':
                        total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                        downloaded_bytes = d.get('downloaded_bytes', 0)
                        percent = (downloaded_bytes / total_bytes * 100) if total_bytes > 0 else 0.0
                        
                        downloaded_mb = f"{round(downloaded_bytes / (1024 * 1024), 1)} MB"
                        total_mb = f"{round(total_bytes / (1024 * 1024), 1)} MB" if total_bytes > 0 else "--"
                        
                        yield f"data: {json.dumps({'status': 'downloading', 'percent': percent, 'downloadedMb': downloaded_mb, 'totalMb': total_mb})}\n\n"
                except asyncio.TimeoutError:
                    continue

            await loop_task
            
            # Send completion response containing the file unique identifier
            yield f"data: {json.dumps({'status': 'complete', 'fileId': file_id})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

def run_download(opts, url):
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])

@app.get("/api/get-file")
async def get_file(fileId: str):
    """Sends the compiled video or audio file back to the browser for downloading safely."""
    if not DOWNLOAD_DIR.exists():
        raise HTTPException(status_code=404, detail="Downloads directory missing")

    # Search explicitly for files starting with the unique fileId UUID
    for file_path in DOWNLOAD_DIR.iterdir():
        if file_path.is_file() and file_path.name.startswith(fileId):
            return FileResponse(path=str(file_path), filename=file_path.name)
            
    raise HTTPException(status_code=404, detail="File not found on disk")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)