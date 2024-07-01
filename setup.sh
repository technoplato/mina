#!/bin/bash
set -e

echo "Initializing and updating whisper.cpp submodule..."
git submodule update --init --recursive

echo "Installing dependencies and compiling C/C++ native addons..."
npm install

echo "Creating audio file for testing..."
ffmpeg -i whisper.cpp/samples/jfk.wav -ar 16000 -ac 1 -c:a pcm_f32le \
-f f32le whisper.cpp/samples/jfk.raw

echo "Downloading whisper model..."
bash whisper.cpp/models/download-ggml-model.sh tiny.en