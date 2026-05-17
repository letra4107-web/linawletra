/**
 * Supabase Storage Service
 * Handles file uploads, downloads, and storage operations
 * Replaces Firebase Storage operations
 */

import { supabase } from '../config/supabase';

const BUCKET_NAME = 'uploads';

/**
 * Upload file to Supabase Storage
 */
export const uploadFile = async (file, path, options = {}) => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: options.upsert || false,
        contentType: file.type,
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(path);

    return {
      path: data.path,
      url: publicUrl,
      id: data.id,
      fullPath: data.fullPath,
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

/**
 * Upload PDF file
 */
export const uploadPDF = async (file, userId, options = {}) => {
  try {
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}_${file.name}`;
    const path = `pdfs/${fileName}`;

    const result = await uploadFile(file, path, options);

    return {
      ...result,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    };
  } catch (error) {
    console.error('Error uploading PDF:', error);
    throw error;
  }
};

/**
 * Upload avatar/profile image
 */
export const uploadAvatar = async (file, userId) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/avatar.${fileExt}`;
    const path = `avatars/${fileName}`;

    const result = await uploadFile(file, path, { upsert: true });

    return result;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    throw error;
  }
};

/**
 * Upload reading material file
 */
export const uploadReadingMaterial = async (file, userId, materialId) => {
  try {
    const timestamp = Date.now();
    const fileName = `${userId}/${materialId}_${timestamp}_${file.name}`;
    const path = `materials/${fileName}`;

    const result = await uploadFile(file, path);

    return {
      ...result,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    };
  } catch (error) {
    console.error('Error uploading reading material:', error);
    throw error;
  }
};

/**
 * Upload student submission file
 */
export const uploadStudentFile = async (file, studentId, assignmentId) => {
  try {
    const timestamp = Date.now();
    const fileName = `${studentId}/${assignmentId}_${timestamp}_${file.name}`;
    const path = `submissions/${fileName}`;

    const result = await uploadFile(file, path);

    return {
      ...result,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    };
  } catch (error) {
    console.error('Error uploading student file:', error);
    throw error;
  }
};

/**
 * Delete file from storage
 */
export const deleteFile = async (path) => {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error deleting file:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

/**
 * Get file URL (public files)
 */
export const getFileUrl = (path) => {
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path);

  return data.publicUrl;
};

/**
 * Get signed URL for private files
 */
export const getSignedFileUrl = async (path, expiresIn = 3600) => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;

    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw new Error(`Failed to get file URL: ${error.message}`);
  }
};

/**
 * List files in a folder
 */
export const listFiles = async (path = '') => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error listing files:', error);
    throw new Error(`Failed to list files: ${error.message}`);
  }
};

/**
 * Validate file before upload
 */
export const validateFile = (file, options = {}) => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = [],
    allowedExtensions = [],
  } = options;

  // Check file size
  if (file.size > maxSize) {
    throw new Error(`File size exceeds ${maxSize / (1024 * 1024)}MB limit`);
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    throw new Error(`File type ${file.type} not allowed. Allowed types: ${allowedTypes.join(', ')}`);
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      throw new Error(`File extension .${extension} not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
    }
  }

  return true;
};

/**
 * Validate PDF file
 */
export const validatePDFFile = (file) => {
  return validateFile(file, {
    maxSize: 25 * 1024 * 1024, // 25MB for PDFs
    allowedTypes: ['application/pdf'],
    allowedExtensions: ['pdf'],
  });
};

/**
 * Validate image file
 */
export const validateImageFile = (file) => {
  return validateFile(file, {
    maxSize: 5 * 1024 * 1024, // 5MB for images
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  });
};

/**
 * Validate document file
 */
export const validateDocumentFile = (file) => {
  return validateFile(file, {
    maxSize: 10 * 1024 * 1024, // 10MB for documents
    allowedTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    allowedExtensions: ['pdf', 'doc', 'docx', 'txt'],
  });
};

/**
 * Upload multiple files
 */
export const uploadMultipleFiles = async (files, basePath, options = {}) => {
  try {
    const results = [];

    for (const file of files) {
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.name}`;
      const path = `${basePath}/${fileName}`;

      const result = await uploadFile(file, path, options);
      results.push({
        ...result,
        originalName: file.name,
        size: file.size,
        type: file.type,
      });
    }

    return results;
  } catch (error) {
    console.error('Error uploading multiple files:', error);
    throw error;
  }
};

/**
 * Get file metadata
 */
export const getFileMetadata = async (path) => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .info(path);

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error getting file metadata:', error);
    throw new Error(`Failed to get file metadata: ${error.message}`);
  }
};