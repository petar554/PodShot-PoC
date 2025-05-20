import express from 'express';
import { getUserById, updateUserProfile } from '../services/supabaseService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await getUserById(userId);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    
    // remove any fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_at;
    
    const updatedProfile = await updateUserProfile(userId, updates);
    
    res.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
