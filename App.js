import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import LandingPage from './src/components/LandingPage';
import CreateAccountPage from './src/components/CreateAccountPage';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

const API_URL = 'http://192.168.1.232:4000';

function AppContent() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('landing');
  const [screenshotUri, setScreenshotUri] = useState(null);
  const [responseData, setResponseData] = useState(null);

  // Check if user is already logged in
  useEffect(() => {
    if (user && currentPage !== 'main') {
      setCurrentPage('main');
    }
  }, [user]);

  const handleGetStarted = () => {
    console.log('Get Started button pressed');
    setCurrentPage('createAccount');
  };

  const handleLogin = () => {
    // for now, this will just go to the main app
    setCurrentPage('main');
  };
  
  const handleBackToLanding = () => {
    setCurrentPage('landing');
  };
  
  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      // navigation to main page will happen automatically due to the useEffect
    } catch (error) {
      console.error('Google login error:', error);
      Alert.alert('Login Failed', 'Could not sign in with Google. Please try again.');
    }
  };
  
  const handleAppleLogin = () => {
    Alert.alert('Apple Login', 'Apple login functionality will be implemented here.');
    setCurrentPage('main');
  };
  
  const handleEmailLogin = () => {
    Alert.alert('Email Login', 'Email login functionality will be implemented here.');
    setCurrentPage('main');
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
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
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
  
  if (loading) {
    // #TODO: add loading screen here
    return <View style={styles.container} />;
  }
  
  if (currentPage === 'landing') {
    return (
      <LandingPage 
        onGetStarted={handleGetStarted} 
        onLogin={handleLogin} 
      />
    );
  }
  
  if (currentPage === 'createAccount') {
    return (
      <CreateAccountPage 
        onBack={handleBackToLanding}
        onGoogleLogin={handleGoogleLogin}
        onAppleLogin={handleAppleLogin}
        onEmailLogin={handleEmailLogin}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* main app content will go here */}
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    marginTop: 50, 
    padding: 20 
  },
});
