require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_STAGING = process.env.NODE_ENV === 'staging' || process.env.EXPO_ENV === 'staging';
const IS_DEVELOPMENT = !IS_PRODUCTION && !IS_STAGING;


const getApiBaseUrl = () => {
  // Explicit override from environment variable (highest priority)
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }

  // Environment-based fallbacks (only if API_BASE_URL not set)
  const env = process.env.NODE_ENV || process.env.EXPO_ENV || 'development';

  switch (env) {
    case 'production':
      console.warn('⚠️  API_BASE_URL not set, using default production URL');
      return 'https://api.storywriter.net';  // Fallback only
    case 'staging':
      console.warn('⚠️  API_BASE_URL not set, using default staging URL');
      return 'https://staging-api.storywriter.net';  // Fallback only
    case 'development':
    default:
      return 'http://localhost:8000';
  }
};

export default ({ config }) => ({
  ...config,
  expo: {
    name: IS_PRODUCTION ? 'StoryWriter' : IS_STAGING ? 'StoryWriter (Staging)' : 'StoryWriter (Dev)',
    slug: "storywriter",
    version: "0.5.0",
    orientation: "landscape",
    icon: "./assets/images/icon.png",
    scheme: "storywriter",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    web: {
      "favicon": "./assets/images/favicon.png",
      "output": "static",
      "build": {
        "publicPath": "/storywriter/"
      },
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.portfola.StoryWriter",
      infoPlist: {
        NSMicrophoneUsageDescription: "This app needs access to microphone for voice input",
        NSSpeechRecognitionUsageDescription: "This app needs access to speech recognition for voice commands",
        UIBackgroundModes: ["audio"],
        UISupportedInterfaceOrientations: [
          "UIInterfaceOrientationLandscapeLeft",
          "UIInterfaceOrientationLandscapeRight"
        ]
      }
    },
    android: {
      package: "com.portfola.StoryWriter",
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#ffffff"
      },
      orientation: "landscape",  // Changed from screenOrientation
      permissions: [
        "RECORD_AUDIO",  // For voice input
        "MODIFY_AUDIO_SETTINGS"  // For audio playback control
      ]
    },
    plugins: [
      "expo-dev-client",
      "expo-secure-store",
      "expo-audio"
    ],
    extra: {
      // Backend Integration
      API_BASE_URL: getApiBaseUrl(),
      apiBaseUrl: getApiBaseUrl(),
      environment: IS_PRODUCTION ? 'production' : IS_STAGING ? 'staging' : 'development',

      // PostHog Analytics
      POSTHOG_API_KEY: process.env.POSTHOG_API_KEY || '',
      POSTHOG_HOST: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',

      // Alternative AI Services (Available for Future Use)
      HUGGING_FACE_API_KEY: process.env.HUGGING_FACE_API_KEY,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: process.env.AWS_REGION,

      eas: {
        projectId: "ddc93476-3b8d-4b46-8ffa-de979a17a116"
      }
    }
  }
});