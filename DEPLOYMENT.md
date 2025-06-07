# Heroku Deployment Guide

## Prerequisites
- Heroku account (paid plan recommended for production)
- Heroku CLI installed
- Git repository setup
- MongoDB Atlas account (for production database)

## Step 1: Install Heroku CLI
Download and install from: https://devcenter.heroku.com/articles/heroku-cli

## Step 2: Login to Heroku
```bash
heroku login
```

## Step 3: Create Heroku App
```bash
heroku create your-app-name
```

## Step 4: Setup MongoDB Atlas
1. Go to https://www.mongodb.com/atlas
2. Create a new cluster or use existing one
3. Create a database user
4. Whitelist Heroku IP addresses (0.0.0.0/0 for simplicity)
5. Get your connection string

## Step 5: Set Environment Variables
```bash
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your_very_secure_random_session_secret_here
heroku config:set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/project_display_app"
heroku config:set CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
heroku config:set CLOUDINARY_API_KEY=your_cloudinary_api_key
heroku config:set CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

## Step 6: Deploy to Heroku
```bash
git push heroku master
```

## Step 7: Open Your App
```bash
heroku open
```

## Step 8: View Logs (if needed)
```bash
heroku logs --tail
```

## Important Notes:
1. Make sure your MongoDB Atlas cluster allows connections from anywhere (0.0.0.0/0)
2. Use strong, unique passwords for all services
3. Keep your environment variables secure
4. Monitor your app performance in Heroku dashboard

## Scaling (if needed):
```bash
# Scale to multiple dynos
heroku ps:scale web=2

# Check current scaling
heroku ps
```

## Custom Domain (optional):
```bash
heroku domains:add yourdomain.com
```

## SSL Certificate (automatic with paid plans):
Your app will automatically get SSL certificate with custom domain on paid plans.

## Monitoring:
- Use Heroku dashboard for basic metrics
- Add New Relic or other monitoring tools for advanced analytics
- Set up log management for better debugging

## Cost Estimation:
- Basic Dyno: $7/month
- MongoDB Atlas M0: Free (512MB storage)
- Cloudinary Free: 25 credits/month
- Total: ~$7/month for small to medium usage

## Troubleshooting:
- If deployment fails, check `heroku logs --tail`
- Ensure all environment variables are set correctly
- Verify MongoDB connection string format
- Check that all required dependencies are in package.json
