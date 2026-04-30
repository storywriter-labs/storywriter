import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'http://127.0.0.1:8000';

/**
 * Backend Connectivity Service
 * 
 * Tests connection to the Laravel backend API on app startup
 */
export class BackendConnectivityService {
  
  /**
   * Test backend connectivity
   * @returns Promise<boolean> - true if backend is reachable
   */
  static async testConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('✅ Backend connectivity test passed');
        return true;
      } else {
        console.warn('⚠️ Backend health check returned non-200 status:', response.status);
        return false;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('⚠️ Backend connectivity test timed out');
      } else {
        console.warn('⚠️ Backend connectivity test failed:', error);
      }
      return false;
    }
  }
  
  /**
   * Get backend configuration status
   */
  static getConfig(): { baseUrl: string; configured: boolean } {
    return {
      baseUrl: API_BASE_URL,
      configured: !!API_BASE_URL && API_BASE_URL !== 'http://127.0.0.1:8000'
    };
  }
}

export default BackendConnectivityService;