const fs = require('fs');
const path = require('path');

const videoPath = './tmp/video de 1 segundo.mp4'; // Reemplaza esto con la ubicación correcta del archivo

if (fs.existsSync(videoPath)) {
  console.log('El archivo de video existe:', videoPath);
} else {
  console.error('El archivo de video no existe:', videoPath);
}