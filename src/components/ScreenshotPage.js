import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  StatusBar,
  ScrollView,
  Alert
} from 'react-native';
import PodcastGrid from './PodcastGrid';

const ScreenshotPage = ({ 
  screenshotUri, 
  responseData, 
  onPickImage, 
  onUploadScreenshot,
  onSignOut 
}) => {
  
  const handlePickImage = () => {
    onPickImage();
  };

  const handleUploadScreenshot = () => {
    onUploadScreenshot();
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: onSignOut }
      ]
    );
  };

  const getStatusColor = () => {
    if (!responseData) return '#666';
    if (responseData.status === 'uploading') return '#00c07f';
    if (responseData.status === 'error') return '#ff4444';
    return '#00c07f';
  };

  const getStatusText = () => {
    if (!responseData) return '';
    if (responseData.status === 'uploading') return 'Processing...';
    if (responseData.status === 'error') return 'Error';
    return 'Success';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <PodcastGrid />
      
      {/* dark overlay */}
      <View style={styles.darkOverlay} />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header with sign out */}
        <View style={styles.header}>
          <Text style={styles.appName}>ShotCast</Text>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Screenshot Processor</Text>
          <Text style={styles.subtitle}>
            Pick a screenshot and let AI extract podcast insights
          </Text>

          {/* Pick Image Button */}
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={handlePickImage}
          >
            <Text style={styles.primaryButtonText}>Pick Screenshot</Text>
          </TouchableOpacity>

          {/* Display selected image */}
          {screenshotUri && (
            <View style={styles.imageContainer}>
              <Image source={{ uri: screenshotUri }} style={styles.image} />
            </View>
          )}

          {/* Upload Button */}
          <TouchableOpacity 
            style={[
              styles.secondaryButton, 
              !screenshotUri && styles.disabledButton
            ]}
            onPress={handleUploadScreenshot}
            disabled={!screenshotUri}
          >
            <Text style={[
              styles.secondaryButtonText,
              !screenshotUri && styles.disabledButtonText
            ]}>
              Upload + Process
            </Text>
          </TouchableOpacity>

          {/* Response Data */}
          {responseData && (
            <View style={styles.resultContainer}>
              <View style={styles.statusHeader}>
                <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
                <Text style={styles.statusText}>{getStatusText()}</Text>
              </View>
              
              <View style={styles.resultBox}>
                <ScrollView style={styles.resultScrollView}>
                  <Text style={styles.resultText}>
                    {typeof responseData === 'string' 
                      ? responseData 
                      : JSON.stringify(responseData, null, 2)
                    }
                  </Text>
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1624',
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 22, 36, 0.4)',
  },
  scrollContent: {
    flexGrow: 1,
    zIndex: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  appName: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  signOutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  signOutText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: '#00c07f',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  disabledButtonText: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  imageContainer: {
    marginVertical: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
  },
  image: {
    width: 280,
    height: 280,
    borderRadius: 8,
    alignSelf: 'center',
  },
  resultContainer: {
    width: '100%',
    marginTop: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    maxHeight: 300,
  },
  resultScrollView: {
    maxHeight: 268,
  },
  resultText: {
    color: 'white',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});

export default ScreenshotPage;
