import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image, 
  StatusBar,
  Dimensions,
  ScrollView
} from 'react-native';
import PodcastGrid from './PodcastGrid';

const { width, height } = Dimensions.get('window');

const LandingPage = ({ onGetStarted, onLogin }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <PodcastGrid />
      
      {/* dark overlay */}
      <View style={styles.darkOverlay} pointerEvents="none"/>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            {/* <Image 
              source={require('../../assets/shotcast-logo.png')} 
              style={styles.logo} 
              resizeMode="contain"
            /> */}
            <Text style={styles.appName}>ShotCast</Text>
          </View>
          
          {/* tagline */}
          <Text style={styles.tagline}>
            Save and remember the{'\n'}best insights from{'\n'}podcasts
          </Text>
          
          <TouchableOpacity 
            style={styles.getStartedButton}
            onPress={onGetStarted}
          >
            <Text style={styles.getStartedText}>Get started</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={onLogin}
          >
            <Text style={styles.loginText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
        
        {/* terms and privacy */}
        <View style={styles.termsContainer}>
          <Text style={styles.termsText}>
            By proceeding, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Use</Text> And{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
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
    backgroundColor: 'rgba(15, 22, 36, 0.7)',
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    zIndex: 2, // ensure content is above the overlay
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 100,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 50,
    height: 50,
    marginRight: 10,
  },
  appName: {
    color: 'white',
    fontSize: 36,
    fontWeight: 'bold',
  },
  tagline: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 60,
    lineHeight: 42,
  },
  getStartedButton: {
    backgroundColor: '#00c07f',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  getStartedText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  loginButton: {
    marginBottom: 20,
  },
  loginText: {
    color: 'white',
    fontSize: 16,
  },
  termsContainer: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  termsText: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    fontSize: 14,
  },
  termsLink: {
    color: 'white',
    textDecorationLine: 'underline',
  },
});

export default LandingPage;
