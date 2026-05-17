<<<<<<< HEAD
# LinawLetra - Full-Stack Capstone Project

A 100% web-based and mobile-responsive application designed to help children with reading difficulties (especially dyslexia) improve their literacy skills in Tagalog through AI-assisted, personalized, and assessment-based learning.

## 🎯 Project Overview

LinawLetra focuses on:
- **Individualized Learning Paths**: Lessons start based on assessment results, not fixed curriculum
- **Comprehensive Assessment**: Evaluates alphabet recognition, letter identification, letter formation, reading, and writing abilities
- **Adaptive Difficulty**: Adjusts learning intensity based on child performance
- **AI-Powered Features**: Tagalog TTS, STT, phonological awareness tools
- **Dyslexia-Friendly Interface**: Minimalist design with proper typography and spacing
- **Session Scheduling**: Teachers can schedule intervention-based sessions
- **Progress Tracking**: Real-time analytics for parents and teachers

## 🏗️ Project Structure

```
linawl/
├── server/                 # Node.js + Express backend
│   ├── models/            # MongoDB schemas
│   ├── routes/            # API routes
│   ├── controllers/        # Business logic
│   ├── middleware/         # Authentication & authorization
│   ├── server.js          # Main server file
│   ├── package.json       # Backend dependencies
│   └── .env.example       # Environment variables template
├── client/                # React + Tailwind CSS frontend
│   ├── src/
│   │   ├── components/    # Reusable React components
│   │   ├── pages/         # Page-level components
│   │   ├── context/       # React context (Auth)
│   │   ├── services/      # API service layer
│   │   ├── App.js         # Main App component
│   │   ├── index.js       # Entry point
│   │   └── index.css      # Global styles
│   ├── public/            # Static files
│   ├── package.json       # Frontend dependencies
│   └── .env.example       # Environment variables template
└── README.md              # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud - MongoDB Atlas)
- npm or yarn

### Backend Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
=======
# LinawLetra Frontend

React + Tailwind CSS frontend for the LinawLetra platform.

## Setup

### 1. Install Dependencies
>>>>>>> 98cbb6e (Initial commit: prepare for Vercel deployment (ignore node_modules, build, .env))
```bash
npm install
```

<<<<<<< HEAD
3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update`.env` with your MongoDB URI and JWT secret:
```
MONGODB_URI=mongodb://localhost:27017/linawletra
JWT_SECRET=your_secure_secret_key_here
PORT=5000
NODE_ENV=development
```

5. Start the backend server:
```bash
npm run dev    # Development with nodemon
npm start      # Production
```

The server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
REACT_APP_API_URL=http://localhost:5000/api
```

4. Start the development server:
=======
### 2. Configure Environment Variables
Create a `.env` file:
```
REACT_APP_API_URL=http://localhost:5000/api
```

> For Expo or mobile builds, you can also use `EXPO_PUBLIC_API_URL` or `API_BASE_URL` to point to the same backend URL.

### 3. Start Development Server
>>>>>>> 98cbb6e (Initial commit: prepare for Vercel deployment (ignore node_modules, build, .env))
```bash
npm start
```

<<<<<<< HEAD
The frontend will open at `http://localhost:3000`

## 📊 Database Schema

### Collections

#### Users
- `name`: String
- `email`: String (unique)
- `password`: String (hashed)
- `role`: Enum (parent, teacher, admin)
- `emailVerified`: Boolean
- `verificationToken`: String
- `resetPasswordToken`: String
- `resetPasswordExpires`: Date
- `createdAt`: Date
- `updatedAt`: Date

#### Students
- `parentId`: ObjectId (ref: User)
- `name`: String
- `age`: Number
- `dateOfBirth`: Date
- `gender`: Enum (male, female, other)
- `assessmentCompleted`: Boolean
- `latestAssessmentId`: ObjectId (ref: Assessment)
- `currentLessonLevel`: Number
- `notes`: String
- `isActive`: Boolean
- `createdAt`: Date
- `updatedAt`: Date

#### Assessments
- `studentId`: ObjectId (ref: Student)
- `parentId`: ObjectId (ref: User)
- `categories`: Object
  - `alphabetRecognition`: { score, maxScore, completed }
  - `letterIdentification`: { score, maxScore, completed }
  - `letterFormation`: { score, maxScore, completed }
  - `readingAbility`: { score, maxScore, completed }
  - `writingAbility`: { score, maxScore, completed }
- `overallScore`: Number
- `recommendedStartLevel`: Number
- `difficultyAdaptation`: Enum (beginner, intermediate, advanced)
- `completedAt`: Date
- `createdAt`: Date

#### Lessons
- `title`: String
- `description`: String
- `level`: Number (1=Beginner, 2=Intermediate, 3=Advanced)
- `category`: Enum (alphabet, letterIdentification, letterFormation, reading, writing)
- `content`: String
- `tagalogText`: String
- `imageUrl`: String
- `audioUrl`: String
- `activities`: Array
  - `id`: String
  - `type`: String (matching, tracing, reading, pronunciation)
  - `instructions`: String
  - `content`: Mixed
- `difficulty`: Number
- `estimatedDuration`: Number (in minutes)
- `createdAt`: Date
- `updatedAt`: Date

#### Progress
- `studentId`: ObjectId (ref: Student)
- `lessonId`: ObjectId (ref: Lesson)
- `status`: Enum (not-started, in-progress, completed)
- `score`: Number
- `maxScore`: Number
- `percentageComplete`: Number
- `activitiesCompleted`: Array
- `timeSpent`: Number (in minutes)
- `startedAt`: Date
- `completedAt`: Date
- `feedback`: String
- `createdAt`: Date
- `updatedAt`: Date

#### Schedules
- `studentId`: ObjectId (ref: Student)
- `teacherId`: ObjectId (ref: User)
- `parentId`: ObjectId (ref: User)
- `lessonId`: ObjectId (ref: Lesson, optional)
- `title`: String
- `description`: String
- `sessionType`: Enum (assessment, lesson, review, practice)
- `scheduledDate`: Date
- `duration`: Number (in minutes)
- `status`: Enum (scheduled, completed, cancelled, rescheduled)
- `notes`: String
- `completedAt`: Date
- `createdAt`: Date
- `updatedAt`: Date

## 🔐 Authentication

- **JWT-based authentication** with tokens stored in localStorage
- **Token validation** on every protected API request
- **Password hashing** with bcryptjs
- **Role-based access control** (RBAC) for different user types

### User Roles

1. **Parent**: 
   - Can register and sign up
   - Can enroll children
   - Can view child progress
   - Can view scheduled sessions

2. **Teacher**:
   - Can view student assessments
   - Can assign/adjust lessons
   - Can schedule sessions
   - Can track student progress

3. **Admin**:
   - Can manage all users and data
   - Can monitor analytics
   - Can manage lessons and assessments

## 🎨 Design Philosophy

### Typography & UI/UX
- **Fonts**: Josefin Sans (main), Comic Sans, Century Gothic, OpenDyslexic
- **Colors**: Green (#2d9c78) and Blue (#1e5a96) hues
- **Design**: Minimalist, clean, focused on letters
- **Spacing**: Proper letter spacing and readability
- **Clarity**: Accurate distinction between similar letters (e.g., I vs L)

### Dyslexia-Friendly Features
- Increased letter spacing and line height
- Clear, sans-serif fonts
- Adequate contrast ratios
- Simple, uncluttered layouts
- Adjustable text size
- ReadableFormatting

## 🤖 AI Features

1. **Text-to-Speech (TTS)**
   - Tagalog language support
   - Audio feedback and pronunciation guides

2. **Speech-to-Text (STT)**
   - Recognize Tagalog words
   - Pronunciation feedback

3. **Phonological Awareness**
   - Identify sounds and syllables
   - Rhyme recognition

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - Register parent
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Students
- `POST /api/students` - Create student
- `GET /api/students` - Get all students (parent's children)
- `GET /api/students/:id` - Get single student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

### Assessments
- `POST /api/assessments` - Create assessment
- `PUT /api/assessments/:id` - Update assessment scores
- `GET /api/assessments/student/:studentId` - Get student assessment
- `GET /api/assessments` - Get all assessments (for parent)

### Lessons
- `POST /api/lessons` - Create lesson (admin/teacher)
- `GET /api/lessons` - Get lessons (with filters)
- `GET /api/lessons/:id` - Get single lesson
- `PUT /api/lessons/:id` - Update lesson (admin/teacher)
- `DELETE /api/lessons/:id` - Delete lesson (admin)

### Progress
- `POST /api/progress` - Create or get progress
- `PUT /api/progress/:id` - Update progress
- `GET /api/progress/student/:studentId` - Get student progress
- `GET /api/progress/dashboard/:studentId` - Get dashboard data

### Schedules
- `POST /api/schedules` - Create schedule (teacher)
- `GET /api/schedules/student/:studentId` - Get schedules for student
- `GET /api/schedules/parent/list` - Get schedules for parent
- `GET /api/schedules/teacher/list` - Get schedules for teacher
- `PUT /api/schedules/:id` - Update schedule
- `DELETE /api/schedules/:id` - Delete schedule

## 🔄 Workflow

### Parent Workflow
1. Register account
2. Enroll child with basic information
3. Child takes literacy assessment
4. System generates personalized learning path
5. Monitor child's progress in dashboard
6. View teacher-scheduled sessions

### Teacher Workflow
1. Login with assigned credentials
2. Review student assessment results
3. Assign appropriate lessons based on baseline
4. Schedule intervention sessions
5. Track student progress
6. Adjust difficulty as needed

### Student Workflow
1. Complete literacy assessment (first time)
2. Access personalized lessons
3. Complete lesson activities
4. Use AI tools (TTS, STT) for support
5. Receive feedback and progress updates

## 🛠️ Technologies

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **Validation**: express-validator
- **HTTP Client**: Axios
- **File Upload**: Multer
- **Development**: Nodemon

### Frontend
- **Library**: React 18
- **Routing**: React Router v6
- **Styling**: Tailwind CSS + Custom CSS
- **HTTP Client**: Axios
- **Icons**: React Icons
- **Date Handling**: date-fns
- **Build**: Create React App

## 📋 Features Checklist

- ✅ User Authentication (JWT)
- ✅ Parent Registration (only role allowed to sign up)
- ✅ Email Verification Ready
- ✅ Password Reset Functionality
- ✅ Role-Based Access Control
- ✅ Student Management
- ✅ Comprehensive Literacy Assessment
- ✅ Adaptive Learning Paths
- ✅ Lesson Management
- ✅ Progress Tracking
- ✅ Dashboard Analytics
- ✅ Session Scheduling
- ✅ Dyslexia-Friendly UI
- ✅ Responsive Design
- ✅ API Error Handling
- ✅ Form Validation (Frontend & Backend)

## 🔜 Future Enhancements

- [ ] Mobile app (React Native)
- [ ] More sophisticated AI/ML for adaptive learning
- [ ] Real-time session features (video call integration)
- [ ] Gamification with more interactive games
- [ ] Parent-teacher communication portal
- [ ] Progress reports generation
- [ ] Multi-language support
- [ ] Offline mode
- [ ] Advanced analytics and reporting

## 📝 Environment Variables

### Backend (.env)
```
MONGODB_URI=mongodb://localhost:27017/linawletra
JWT_SECRET=your_secure_secret_key_here
PORT=5000
NODE_ENV=development
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5000/api
# Alternatively for Expo/mobile builds:
# EXPO_PUBLIC_API_URL=http://localhost:5000/api
# API_BASE_URL=http://localhost:5000/api
```

## 📚 Sample Data

Sample lessons and assessments can be seeded into MongoDB using the provided seed script (to be created):

```bash
npm run seed
```

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📄 License

ISC License - See LICENSE file for details

## 👨‍💻 Author

Full-Stack Capstone Project

## 📞 Support

For issues or questions, please refer to the project documentation or contact the development team.

---

**Note**: This is a complete project scaffold. Production deployment requires additional security measures, environment configuration, and testing.
=======
Opens at: `http://localhost:3000`

## Project Structure

### Components (`src/components/`)
- `Navigation.js` - Main navigation bar
- `Login.js` - Login page component
- `Register.js` - Parent registration component
- `StudentManagement.js` - Manage enrolled children
- `AssessmentComponent.js` - Literacy assessment interface
- `LessonComponent.js` - Lesson viewer with TTS support

### Pages (`src/pages/`)
- `Home.js` - Landing page
- `Dashboard.js` - Student progress dashboard

### Context (`src/context/`)
- `AuthContext.js` - Global authentication state

### Services (`src/services/`)
- `api.js` - Centralized API service with axios instance

### Styling
- `index.css` - Global dyslexia-friendly stylesheet

## Features

### Authentication
- Parent-only registration
- JWT token-based login
- Protected routes
- Automatic logout on token expiry

### Student Management
- Add/enroll children
- View child details
- Track assessments

### Assessment
- Multi-category literacy assessment
- Progress bar
- Score tracking
- Personalized learning path generation

### Lessons
- Tagalog text display with proper formatting
- Text-to-Speech (TTS) support
- Responsive lesson viewer
- Progress tracking

### Dashboard
- Student selection
- Quick statistics (completed lessons, completion rate, average score)
- Recent activity
- Mobile responsive

### Dyslexia-Friendly Design
- Josefin Sans + Comic Sans typography
- Proper letter spacing (0.06em)
- Increased line height (1.8)
- Green and Blue color scheme
- Minimalist, uncluttered interface
- High contrast for readability

## Building

### Development Build
```bash
npm start
```

### Production Build
```bash
npm run build
```

Creates optimized build in `build/` folder.

## Available Scripts

- `npm start` - Run development server
- `npm run build` - Create production build
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App (irreversible)

## Responsive Design

The app is fully responsive:
- Mobile-first approach
- Grid layouts with auto-fit columns
- Flexible typography sizing
- Touch-friendly buttons

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance

- Code splitting with React.lazy (optional enhancement)
- Efficient re-renders with proper component structure
- Optimized API calls with centralized service
- CSS in JavaScript for scoped styling

## Accessibility

- Semantic HTML
- Proper heading hierarchy
- ARIA labels where needed
- Keyboard navigation support
- Color contrast compliance

## Troubleshooting

### Blank Page on Startup
- Check browser console for errors
- Ensure backend API is running
- Verify `.env` configuration

### API Connection Issues
- Confirm `REACT_APP_API_URL`, `EXPO_PUBLIC_API_URL`, or `API_BASE_URL` is correct
- Check backend is running on correct port
- Verify CORS is enabled on backend

### Styling Not Applying
- Clear browser cache
- Restart development server
- Check CSS file is imported

## Deployment

### Vercel
```bash
npm install -g vercel
vercel
```

### Netlify
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set publish directory: `build`

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Environment Setup for Production

Update `.env` for production API:
```
REACT_APP_API_URL=https://api.yourdomain.com
```

> For mobile/Expo, the same backend URL can also be assigned to `EXPO_PUBLIC_API_URL` or `API_BASE_URL`.

## Documentation

- [React Documentation](https://react.dev/)
- [React Router Documentation](https://reactrouter.com/)
- [Axios Documentation](https://axios-http.com/)
- [Dyslexia-Friendly Web Design](https://www.bdadyslexia.org.uk/)
>>>>>>> 98cbb6e (Initial commit: prepare for Vercel deployment (ignore node_modules, build, .env))
