For Kokoro:

# 1. Install proper python version

brew install python@3.12 espeak-ng

# 1. Create your server directory

mkdir local-tts-server && cd local-tts-server

# 2. Force the virtual environment to use Python 3.12

python3.12 -m venv venv

# 3. Activate the environment

source venv/bin/activate

# 4. Install Required Packages

pip install --upgrade pip
pip install kokoro-mlx fastapi uvicorn

# 5. Build the Kokoro Server

Create a file named server.py inside your local-tts-server folder and paste the server code (server.py). This sets up an optimized POST endpoint (/api/tts) that outputs raw .wav audio binary bytes back to your Next.js frontend.

# 6. Call the kokoro API via http://127.0.0.1:8000

To rerun:
cd local-tts-server
source venv/bin/activate
python server.py
