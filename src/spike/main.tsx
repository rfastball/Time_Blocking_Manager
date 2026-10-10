import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {Today} from './Today.tsx';
import {load} from './store.ts';
import {readTheme} from '../theme.ts';
import '../fonts.css';
import '../tokens.css';
import './spike.css';

try{document.documentElement.dataset.theme=readTheme(window.localStorage);}catch{document.documentElement.dataset.theme='default';}
void load();
createRoot(document.querySelector('#app')!).render(<StrictMode><MotionConfig reducedMotion="user"><Today/></MotionConfig></StrictMode>);
