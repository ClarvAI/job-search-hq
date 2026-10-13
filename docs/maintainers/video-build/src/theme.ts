import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadBody } from '@remotion/google-fonts/SourceSans3';
import { loadFont as loadMono } from '@remotion/google-fonts/SourceCodePro';

// Job Search HQ "default" look (templates/blank/pages/dashboard.html tokens).
export const display = loadDisplay('normal', { weights: ['600', '700'], subsets: ['latin'] }).fontFamily;
export const body = loadBody('normal', { weights: ['400', '600', '700'], subsets: ['latin'] }).fontFamily;
export const mono = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily;

export const c = {
  n1: '#fefcfa',
  n2: '#fbf8f5',
  n3: '#f4f0ec',
  n4: '#ece6e0',
  n6: '#d9d0c6',
  n9: '#7a7062',
  n11: '#635b50',
  n12: '#27221b',
  a3: '#dbf7f9',
  a9: '#187075',
  a11: '#25676b',
  a12: '#182626',
  amber: '#b45309',
  amberBg: '#fef3c7',
  red: '#b42318',
  green: '#1f7a4d',
  greenBg: '#dcf5e7',
};

export const FPS = 30;
export const s = (seconds: number) => Math.round(seconds * FPS);
