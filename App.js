import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import LandingPage from './src/components/LandingPage';

const API_URL = 'http://192.168.3.15:4000';

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [screenshotUri, setScreenshotUri] = useState(null);
  const [responseData, setResponseData] = useState(null);

  const handleGetStarted = () => {
    setShowLanding(false);
  };

  const handleLogin = () => {
    setShowLanding(false);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissions required', 'Please allow access to photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1
    });
    if (!result.canceled && result.assets?.length > 0) {
      setScreenshotUri(result.assets[0].uri);
      setResponseData(null);
    }
  };

  const uploadScreenshot = async () => {
    if (!screenshotUri) {
      Alert.alert('No image selected', 'Pick a screenshot first.');
      return;
    }
    
    try {
      setResponseData({ status: 'uploading', message: 'Processing your screenshot...' });
      
      const formData = new FormData();
      formData.append('screenshot', {
        uri: screenshotUri,
        type: 'image/png',
        name: 'screenshot.png'
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout
      
      const res = await fetch(`${API_URL}/process-screenshot`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const data = await res.json();
      setResponseData(data);
    } catch (err) {
      console.error('Error details:', err);
      if (err.name === 'AbortError') {
        setResponseData({ 
          status: 'error', 
          message: 'Request timed out. The server is taking too long to process your image.' 
        });
      } else {
        setResponseData({ 
          status: 'error', 
          message: `Upload failed: ${err.message}` 
        });
      }
    }
  };
  
  if (showLanding) {
    return (
      <LandingPage 
        onGetStarted={handleGetStarted} 
        onLogin={handleLogin} 
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Original app content will go here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    marginTop: 50, 
    padding: 20 
  },
});
