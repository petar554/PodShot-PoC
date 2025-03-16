import React, { useState } from 'react';
import { View, Text, Button, Image, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const API_URL = '*************'

export default function App() {
  const [screenshotUri, setScreenshotUri] = useState(null);
  const [responseData, setResponseData] = useState(null);

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
  
  return (
    <View style={styles.container}>

      <Text style={styles.header}>PodShot Proof-of-Concept</Text>
      <Button title="Pick Screenshot" onPress={pickImage} />
      {screenshotUri && (
        <Image source={{ uri: screenshotUri }} style={styles.image} />
      )}
      <Button title="Upload + Process" onPress={uploadScreenshot} />
      {responseData && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>
            {JSON.stringify(responseData, null, 2)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 50, padding: 20 },
  header: { fontSize: 18, marginBottom: 10 },
  image: { width: 200, height: 200, alignSelf: 'center', marginVertical: 10 },
  resultBox: { marginTop: 20 },
  resultText: { fontSize: 14 }
});
