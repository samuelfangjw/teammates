import { APPLICATION_VERSION } from './application-version';
import { config } from './config';

/**
 * Environment variables for production mode.
 */
export const environment = {
  ...config,
  version: APPLICATION_VERSION,
  production: true,
  backendUrl: '',
  frontendUrl: '',
  withCredentials: false,
};
