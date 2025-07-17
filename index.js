// Import polyfills first - using individual polyfills instead of the problematic auto import
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
