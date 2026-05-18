# LinawLetra Backend API

Node.js + Express backend for the LinawLetra platform.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file:
```
MONGODB_URI=mongodb://localhost:27017/linawletra
JWT_SECRET=your_jwt_secret_key_here
PORT=5000
NODE_ENV=development
```

### 3. MongoDB Setup

#### Option A: Local MongoDB
```bash
# Windows
mongod

# Mac (if installed via Homebrew)
brew services start mongodb-community
```

#### Option B: MongoDB Atlas (Cloud)
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a cluster
4. Get your connection string
5. Update `MONGODB_URI` in `.env`

### 4. Start Server

Development (with auto-reload):
```bash
npm run dev
```

Production:
```bash
npm start
```

Server runs on: `http://localhost:5000`

## API Structure

### Models
- `User.js` - User authentication model
- `Student.js` - Student information model
- `Assessment.js` - Literacy assessment model
- `Lesson.js` - Lesson content model
- `Progress.js` - Student progress tracking
- `Schedule.js` - Teacher session scheduling

### Controllers
- `authController.js` - Authentication logic
- `studentController.js` - Student management
- `assessmentController.js` - Assessment handling
- `lessonController.js` - Lesson management
- `progressController.js` - Progress tracking
- `scheduleController.js` - Schedule management

### Routes
- `/api/auth` - Authentication routes
- `/api/students` - Student management routes
- `/api/assessments` - Assessment routes
- `/api/lessons` - Lesson routes
- `/api/progress` - Progress tracking routes
- `/api/schedules` - Schedule routes
- `/api/users` - User profile routes

### Middleware
- `auth.js` - JWT authentication and role-based authorization

## Testing API

Use [Postman](https://www.postman.com/) or `curl` to test endpoints.

### Example: Register User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

### Example: Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

## Error Handling

All endpoints return structured error responses:
```json
{
  "message": "Error description"
}
```

## Authentication

Include JWT token in request headers:
```
Authorization: Bearer <your_jwt_token>
```

## Deployment

For production deployment:

1. Set `NODE_ENV=production` in `.env`
2. Use environment-specific JWT secret
3. Configure MongoDB with proper authentication
4. Set up HTTPS/SSL
5. Use a process manager like PM2

Example PM2 setup:
```bash
npm install -g pm2
pm2 start server.js --name "linawletra-api"
```

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`
- Verify MongoDB credentials (if using Atlas)

### Port Already in Use
```bash
# Change PORT in .env or kill existing process
lsof -i :5000  # Find process on port 5000
kill -9 <PID>  # Kill the process
```

### JWT Issues
- Ensure token is included in Authorization header
- Check token hasn't expired
- Verify JWT_SECRET matches in `.env`

## Performance Tips

1. Add database indexes for frequently queried fields
2. Use pagination for list endpoints
3. Cache assessment results
4. Implement rate limiting
5. Use CDN for static assets

## Security

- Passwords are hashed with bcryptjs
- JWT tokens expire after 7 days
- CORS enabled for frontend origin
- Input validation on all endpoints
- Role-based access control implemented

## Documentation

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express Documentation](https://expressjs.com/)
- [JWT Documentation](https://jwt.io/)
