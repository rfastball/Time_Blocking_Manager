// Global styles first, so each area's stylesheet (imported with its components below) can refine them.
import '../fonts.css';
import '../tokens.css';
import './ui/base.css';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {getState} from './store/state.ts';
import {start} from './store/lifecycle.ts';
import {Shell} from './shell/Shell.tsx';
import {CaptureWindow} from './capture/CaptureWindow.tsx';

void start();
createRoot(document.querySelector('#app')!).render(<StrictMode><MotionConfig reducedMotion="user">{getState().captureWindow?<CaptureWindow/>:<Shell/>}</MotionConfig></StrictMode>);
