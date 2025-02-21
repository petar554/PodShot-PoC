import React, { useState } from 'react';
import { View, Text, Button, Image, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// const API_URL = 'http://localhost:4000'; // or LAN IP if using a real device
const API_URL = 'http://192.168.1.175:4000';

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

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setScreenshotUri(result.assets[0].uri);
      setResponseData(null);
    }

    // if (!result.canceled && result.uri) {
    //   setScreenshotUri(result.uri);
    //   setResponseData(null);
    // }
  };

  const uploadScreenshot = async () => {
    if (!screenshotUri) {
      Alert.alert('No image selected', 'Please pick a screenshot first.');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('screenshot', {
        uri: screenshotUri,
        type: 'image/png',
        name: 'screenshot.png'
      });

      const res = await fetch(`${API_URL}/process-screenshot`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      const data = await res.json();
      setResponseData(data);
    } catch (err) {
      Alert.alert('Error uploading screenshot', err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PodShot POC</Text>
      <Button title="Pick Screenshot" onPress={pickImage} />
      {screenshotUri && (
        <Image source={{ uri: screenshotUri }} style={styles.imagePreview} />
      )}
      <Button title="Upload + Process" onPress={uploadScreenshot} />
      {responseData && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Server Response:</Text>
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
  title: { fontSize: 18, marginBottom: 10 },
  imagePreview: {
    width: 200, height: 200, alignSelf: 'center', marginVertical: 10
  },
  resultBox: { marginTop: 20 },
  resultTitle: { fontWeight: 'bold' },
  resultText: { marginTop: 5, fontSize: 14 }
});
