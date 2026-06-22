import os
import uuid
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from kokoro_mlx import KokoroTTS

app = FastAPI(title="Native Apple Silicon Kokoro TTS Server")

# Enable CORS so your local Next.js server/browser can talk to it without friction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to ["http://localhost:3000"] for stricter security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Kokoro on the M1 GPU globally so it stays warm in memory
print("🚀 Loading Kokoro-MLX onto Apple Silicon GPU/Metal...")
tts = KokoroTTS.from_pretrained("mlx-community/Kokoro-82M-bf16")
print("✅ TTS Engine loaded and ready!")

@app.post("/api/tts")
async def text_to_speech(payload: dict):
    text = payload.get("text", "").strip()
    voice = payload.get("voice", "af_bella")  # Excellent default US female voice
    speed = payload.get("speed", 1.0)
    
    if not text:
        raise HTTPException(status_code=400, detail="Text parameter cannot be empty.")
        
    # Generate a unique temp file to handle concurrent requests cleanly
    temp_file = f"tts_{uuid.uuid4().hex}.wav"
    
    try:
        # Synthesize text on Metal GPU and write a rapid temporary file
        tts.save(text, temp_file, voice=voice, speed=speed)
        
        # Read the file bytes directly into memory
        with open(temp_file, "rb") as f:
            audio_bytes = f.read()
            
        # Return the raw audio binary back to the client
        return Response(content=audio_bytes, media_type="audio/wav")
        
    except Exception as e:
        print(f"❌ Generation Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Text-to-Speech engine error.")
        
    finally:
        # Clean up the file from your SSD instantly
        if os.path.exists(temp_file):
            os.remove(temp_file)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)