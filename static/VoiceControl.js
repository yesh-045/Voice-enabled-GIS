function VoiceControl(map) {
    const API_KEY = '3dbace9e3c914f22b885ec67b0906a19';
    const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}');
    const baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    const micButton = document.getElementById('mic');
    const statusElement = document.getElementById('status');
    let mediaRecorder;

    map.setView([0, 0], 2);
    const featureGroup = L.featureGroup().addTo(map);
    let currentDistanceLine = null;

    const commands = [
        { name: 'zoom in', phrases: ['zoom in', 'increase zoom', 'zoom closer'], action: () => { map.zoomIn(); updateStatus('Zoomed in'); } },
        { name: 'zoom out', phrases: ['zoom out', 'decrease zoom', 'zoom away'], action: () => { map.zoomOut(); updateStatus('Zoomed out'); } },
        { name: 'pan left', phrases: ['pan left', 'move left', 'go left'], action: () => { map.panBy([100, 0]); updateStatus('Panned left'); } },
        { name: 'pan right', phrases: ['pan right', 'move right', 'go right'], action: () => { map.panBy([-100, 0]); updateStatus('Panned right'); } },
        { name: 'pan up', phrases: ['pan up', 'move up', 'go up'], action: () => { map.panBy([0, 100]); updateStatus('Panned up'); } },
        { name: 'pan down', phrases: ['pan down', 'move down', 'go down'], action: () => { map.panBy([0, -100]); updateStatus('Panned down'); } },
        { name: 'show satellite', phrases: ['show satellite', 'satellite view', 'switch to satellite'], action: toggleSatellite },
        { name: 'show base map', phrases: ['show base map', 'base map view', 'switch to base map'], action: toggleBaseMap },
        { name: 'clear map', phrases: ['clear map', 'clear all', 'remove all'], action: clearFeatures },
        { name: 'reset view', phrases: ['reset view', 'reset map', 'go to world view'], action: () => { map.setView([0, 0], 2); updateStatus('View reset'); } },
        { name: 'reset map', phrases: ['reset map', 'reset view', 'go to world view'], action: resetMap },
        { name: 'pin location', phrases: ['pin location', 'add marker', 'mark this place'], action: pinCurrentLocation },
    ];

 
    mic.addEventListener('click', toggleRecording);
    document.addEventListener("keydown" , function(e){
        if(e.key === "Enter"){
            toggleRecording();
        }
    })

    function toggleRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            document.getElementById("mic").style.backgroundColor = "rgb(24,143,255)";
            statusElement.textContent = 'Start Listening';
            updateStatus('Processing...');
        } else {
            startRecording();
            
        }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            let audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks);
                const formData = new FormData();
                formData.append('audio', audioBlob, 'audio.wav');

                try {
                    const response = await fetch('http://127.0.0.1:5000/transcribe', { method: 'POST', body: formData });
                    if (!response.ok) throw new Error('Transcription failed');
                    const { transcription } = await response.json();
                    handleCommand(transcription.toLowerCase());
                } catch (error) {
                    //Erro happens here
                    updateStatus(`Error: ${error.message}`);
                }
            };

            mediaRecorder.start();
            statusElement.textContent = 'Stop Listening';
            document.getElementById("mic").style.backgroundColor = "orangered";
            updateStatus('Listening...');
        } catch (error) {
            updateStatus(`Microphone error: ${error.message}`);
        }
    }

    function handleCommand(transcription) {
        updateStatus(`Recognized: ${transcription}`);

        const bestMatch = findBestMatch(transcription);
        if (bestMatch) {
            bestMatch.action();
            return;
        }

        if (transcription.includes('hello') || transcription.includes('hi')) {
            speak("Hello! How can I assist you with the map today?");
        } else if (transcription.includes('thank you') || transcription.includes('thanks')) {
            speak("You're welcome! Is there anything else I can help you with?");
        } else if (transcription.includes('what can you do')) {
            speak("I can help you navigate the map, find locations, measure distances, and control map views. Just ask me what you'd like to do!");
        
        }
        if (transcription.includes('help') || transcription.includes('what can you do')) {
            provideHelp();
        }

        else if (transcription.includes('go to') || transcription.includes('navigate to')) {
            const location = transcription.replace(/go to|navigate to/gi, '').trim();
            if (location) {
                navigateToLocation(location);
            } else {
                updateStatus('Could not understand the location. Please try again.');
            }
        } else if (transcription.includes('measure distance') || transcription.includes('distance between')) {
            const locations = transcription.match(/(?:between|from)?\s*(.+?)\s+(?:and|to)\s+(.+)/i);
            if (locations && locations.length === 3) {
                measureDistance(locations[1].trim(), locations[2].trim());
            } else {
                updateStatus('Could not understand the locations for distance measurement. Please try again.');
            }
        } else if (transcription.includes('what\'s the weather in')) {
            const location = transcription.replace('what\'s the weather in', '').trim();
            getWeatherForLocation(location).then(weather => {
                speak(`The weather in ${location} is ${weather.description} with a temperature of ${weather.temperature}°C`);
            });
        } 
        else if (transcription.includes('find route from') && transcription.includes('to')) {
            const match = transcription.match(/find route from (.+) to (.+)/i);
            if (match) {
                findRoute(match[2], match[1]);
            } else {
                speak("I couldn't understand the route request. Please try again.");
            }}
        else {
            updateStatus('Command not recognized. Please try again.');
        }
    }

    function findBestMatch(transcription) {
        let bestMatch = null;
        let highestScore = 0;

        for (const cmd of commands) {
            for (const phrase of cmd.phrases) {
                const score = similarity(transcription, phrase);
                if (score > highestScore && score > 0.6) { // Threshold for matching
                    highestScore = score;
                    bestMatch = cmd;
                }
            }
        }

        return bestMatch;
    }

    function similarity(s1, s2) {
        let longer = s1;
        let shorter = s2;
        if (s1.length < s2.length) {
            longer = s2;
            shorter = s1;
        }
        const longerLength = longer.length;
        if (longerLength === 0) {
            return 1.0;
        }
        return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
    }

    function editDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) {
                costs[s2.length] = lastValue;
            }
        }
        return costs[s2.length];
    }

    async function navigateToLocation(location) {
        updateStatus(`Searching for ${location}...`);
        const coords = await getLatLong(location);
        if (coords) {
            map.flyTo([coords.latitude, coords.longitude], 10);
            L.marker([coords.latitude, coords.longitude]).addTo(featureGroup)
                .bindPopup(location).openPopup();
            updateStatus(`Navigated to ${location}`);
            speak('Navigated to ${location}');
        } else {
            updateStatus(`Could not find location: ${location}`);
            speak(`Could not find location: ${location}`);
        }
    }

    async function measureDistance(location1, location2) {
        updateStatus(`Measuring distance between ${location1} and ${location2}...`);
        const [point1, point2] = await Promise.all([getLatLong(location1), getLatLong(location2)]);
        if (point1 && point2) {
            if (currentDistanceLine) {
                map.removeLayer(currentDistanceLine);
            }
            const from = turf.point([point1.longitude, point1.latitude]);
            const to = turf.point([point2.longitude, point2.latitude]);
            const distance = turf.distance(from, to, { units: 'kilometers' });

            currentDistanceLine = L.polyline([
                [point1.latitude, point1.longitude],
                [point2.latitude, point2.longitude]
            ], { color: 'red' }).addTo(featureGroup);

            currentDistanceLine.bindPopup(`Distance: ${distance.toFixed(2)} km`).openPopup();

            map.fitBounds(currentDistanceLine.getBounds(), { padding: [50, 50] });
            updateStatus(`Distance: ${distance.toFixed(2)} km. Would you like me to suggest a route between these locations?`);
            speak(`The distance is ${distance.toFixed(2)} km. Would you like me to suggest a route between these locations?`);
        } else {
            updateStatus('Could not find one or both locations');
            speak('Could not find one or both locations');
        }
    }

    async function getLatLong(placeName) {
        try {
            const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(placeName)}&key=${API_KEY}`);
            if (!response.ok) throw new Error('Geocoding failed');
            const data = await response.json();
            if (data.results.length > 0) {
                return {
                    latitude: data.results[0].geometry.lat,
                    longitude: data.results[0].geometry.lng
                };
            }
            throw new Error('Place not found');
        } catch (error) {
            updateStatus(`Location error: ${error.message}`);
            return null;
        }
    }

    function toggleSatellite() {
        if (map.hasLayer(satelliteLayer)) {
            updateStatus('Already in satellite view');
            speak('Already in satellite view');
        } else {
            map.removeLayer(baseLayer);
            map.addLayer(satelliteLayer);
            updateStatus('Switched to satellite view');
            speak('Switched to satellite view');
        }
    }

    function toggleBaseMap() {
        if (map.hasLayer(baseLayer)) {
            updateStatus('Already in base map view');
        } else {
            map.removeLayer(satelliteLayer);
            map.addLayer(baseLayer);
            updateStatus('Switched to base map view');
        }
    }

    function resetMap() {
        map.setView([0, 0], 2);
        clearFeatures();
        updateStatus('Map reset to world view and all features cleared');
    }

    function pinCurrentLocation() {
        const center = map.getCenter();
        L.marker(center).addTo(featureGroup)
            .bindPopup('Pinned Location').openPopup();
        updateStatus("I've pinned this location. Would you like me to find nearby points of interest?");
        speak("I've pinned this location. Would you like me to find nearby points of interest?");
    }

    function clearFeatures() {
        featureGroup.clearLayers();
        if (currentDistanceLine) {
            map.removeLayer(currentDistanceLine);
            currentDistanceLine = null;
        }
        updateStatus('All features cleared from the map');
    }

    function updateStatus(message) {
        statusElement.textContent = message;
        console.log(message);
    }

    async function getWeatherForLocation(location) {
// weather api
    }
    

    async function findRoute(destination, origin) {
        try {
            updateStatus(`Finding route from ${origin} to ${destination}...`);
            const [startCoords, endCoords] = await Promise.all([getLatLong(origin), getLatLong(destination)]);
            if (startCoords && endCoords) {
                const routeResponse = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=apikey&start=${startCoords.longitude},${startCoords.latitude}&end=${endCoords.longitude},${endCoords.latitude}`);
                if (!routeResponse.ok) throw new Error('Route request failed');
                const routeData = await routeResponse.json();
                const routeCoordinates = routeData.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
                const routeLine = L.polyline(routeCoordinates, { color: 'blue' }).addTo(featureGroup);
    
                map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
                updateStatus(`Route found from ${origin} to ${destination}`);
                speak(`Here is the route from ${origin} to ${destination}`);
            } else {
                updateStatus('Could not find one or both locations for the route');
            }
        } catch (error) {
            updateStatus(`Route error: ${error.message}`);
        }
    }
    function provideHelp() {
    speak("Here are some things you can ask me: 'Go to' or 'Navigate to' a place, 'Measure distance between' two places, 'What's the weather in' a place, 'Find route from' one place 'to' another, 'Tell me about this area', or 'Zoom to my location'. You can also ask me to zoom in, zoom out, pan the map, or switch between satellite and base map views.");
}
    function speak(message) {
        const utterance = new SpeechSynthesisUtterance(message);
        window.speechSynthesis.speak(utterance);
        updateStatus(message);
    }
   
}

// Initialize the map and voice control
const map = L.map('map');
const voiceControl = new VoiceControl(map);
