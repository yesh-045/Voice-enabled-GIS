from flask import Flask, request, jsonify, render_template
import whisper
import os

app = Flask(__name__)
model = whisper.load_model("base")

@app.route('/')
def index():
    return render_template('check.html')

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    audio_path = 'uploaded_audio.wav'
    audio_file.save(audio_path)

    transcription = transcribe_audio(audio_path)
    os.remove(audio_path) 
    return jsonify({'transcription': transcription})

def transcribe_audio(audio_path):
    result = model.transcribe(audio_path)
    return result['text']

if __name__ == '__main__':
    app.run(debug=True)