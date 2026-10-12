import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.remy.ai',
  appName: 'Remy AI',
  webDir: 'www',
  server: {
    allowNavigation: ['remyaii.netlify.app', 'remy-ai-api.onrender.com', 'accounts.google.com', 'www.google.com'],
  },
};

export default config;
