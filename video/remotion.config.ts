import {Config} from '@remotion/cli/config';

// Reuse the repository's checked-in, real product captures without duplicating
// large PNG files inside the video package.
Config.setPublicDir('../docs/screenshots');
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setOutputLocation('out/vibespace-promo.mp4');
