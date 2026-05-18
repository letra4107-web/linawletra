const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const User = require('../models/User');

const router = express.Router();

const sendError = (res, status, message, error = null) => {
  const payload = { status, message };
  if (error) payload.error = String(error);
  return res.status(status).json(payload);
};

// Get user profile
router.get('/profile', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Sync user role metadata to Supabase Auth
router.get('/sync-claims', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User profile not found' });
    }

    const role = String(user.role || 'parent').toLowerCase();
    const approved = ['approved', 'active'].includes(String(user.accountStatus || user.status || '').toLowerCase());

    const { error } = await supabase.auth.admin.updateUserById(req.user.id, {
      user_metadata: { role, approved },
    });

    if (error) {
      console.warn('Supabase metadata sync error:', error);
    }

    res.json({ status: 200, message: 'Sync claims requested', role });
  } catch (error) {
    console.error('Sync claims error:', error);
    return sendError(res, 500, 'Unable to sync claims', error.message);
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { name, phone });
    res.json({ message: 'Profile updated', user });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete user (Admin only) - Deletes both Supabase Auth user and database profile
router.delete('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const isSelfDelete = req.user.id === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isSelfDelete) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      if (!isSelfDelete) {
        return res.status(404).json({ message: 'User profile not found' });
      }

      // If the profile is already gone but the user is deleting their own account,
      // still remove the Auth user so the email can be reused.
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteAuthError && !String(deleteAuthError.message).toLowerCase().includes('not found')) {
        console.error('Supabase auth delete error for missing profile:', deleteAuthError);
        return sendError(res, 500, 'Failed to delete user from Supabase Auth', deleteAuthError.message);
      }

      return res.json({ message: 'User deleted from Supabase Auth (profile already removed).' });
    }

    if (!isAdmin && targetUser.id !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own account' });
    }

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthError && !String(deleteAuthError.message).toLowerCase().includes('not found')) {
      console.error('Supabase auth delete error:', deleteAuthError);
      return sendError(res, 500, 'Failed to delete user from Supabase Auth', deleteAuthError.message);
    }

    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser && !isSelfDelete) {
      return sendError(res, 500, 'Failed to delete user profile from database');
    }

    res.json({ message: 'User deleted successfully from Supabase Auth and database' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return sendError(res, 500, 'Failed to delete user', error.message);
  }
});

module.exports = router;
