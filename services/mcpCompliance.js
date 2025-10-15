/**
 * MCP (Visit Plan) Compliance Service
 */
const mongoose = require('mongoose');

// Plan Visit Model for MCP compliance checking
const planVisitSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'plan_visit'
});

// Connect to the project_display_app database for plan visits
const planVisitConnection = mongoose.createConnection(
  process.env.MONGODB_URI?.replace(/\/[^\/]*$/, '/project_display_app') || 'mongodb://localhost:27017/project_display_app',
  {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
);

const PlanVisit = planVisitConnection.model('plan_visit', planVisitSchema);

/**
 * Check if a submission complies with the MCP visit plan
 */
async function checkMCPCompliance(username, storeCode, submissionDate) {
  try {
    const submissionDateStr = submissionDate.toISOString().split('T')[0];

    console.log(`🔍 Checking MCP compliance for:`, {
      username,
      storeCode,
      submissionDate: submissionDateStr
    });

    const planVisit = await PlanVisit.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') },
      $and: [
        {
          $or: [
            { storeCode: { $regex: new RegExp(`^${storeCode}$`, 'i') } },
            { storeCode: parseInt(storeCode) },
            { storeCode: storeCode }
          ]
        },
        {
          $or: [
            { Date: { $gte: new Date(submissionDateStr), $lt: new Date(submissionDateStr + 'T23:59:59.999Z') } },
            { date: { $gte: new Date(submissionDateStr), $lt: new Date(submissionDateStr + 'T23:59:59.999Z') } },
            { visitDate: { $gte: new Date(submissionDateStr), $lt: new Date(submissionDateStr + 'T23:59:59.999Z') } }
          ]
        }
      ]
    }).lean();

    console.log(`📋 Plan visit found:`, planVisit ? 'YES' : 'NO');

    if (planVisit) {
      console.log(`✅ Plan visit details:`, JSON.stringify(planVisit, null, 2));
    } else {
      // Debug logging
      const userExists = await PlanVisit.findOne({
        username: { $regex: new RegExp(`^${username}$`, 'i') }
      }).lean();
      console.log(`👤 User '${username}' has any plans:`, userExists ? 'YES' : 'NO');

      const storeExists = await PlanVisit.findOne({
        $or: [
          { storeCode: { $regex: new RegExp(`^${storeCode}$`, 'i') } },
          { storeCode: parseInt(storeCode) },
          { storeCode: storeCode }
        ]
      }).lean();
      console.log(`🏪 Store '${storeCode}' has any plans:`, storeExists ? 'YES' : 'NO');

      const userStoreExists = await PlanVisit.findOne({
        username: { $regex: new RegExp(`^${username}$`, 'i') },
        $or: [
          { storeCode: { $regex: new RegExp(`^${storeCode}$`, 'i') } },
          { storeCode: parseInt(storeCode) },
          { storeCode: storeCode }
        ]
      }).lean();
      console.log(`🎯 User + Store combo exists:`, userStoreExists ? 'YES' : 'NO');
      if (userStoreExists) {
        console.log(`📅 Planned date:`, userStoreExists.Date || userStoreExists.date);
      }
    }

    return planVisit !== null;
  } catch (error) {
    console.warn(`Warning: Error checking MCP compliance for ${username}:`, error.message);
    return false;
  }
}

/**
 * Get overall MCP compliance for a user's submissions
 */
async function getUserMCPCompliance(username, submissions) {
  try {
    let compliantVisits = 0;
    let totalVisits = 0;

    for (const submission of submissions) {
      totalVisits++;
      const isCompliant = await checkMCPCompliance(username, submission.storeId, submission.submittedAt);
      if (isCompliant) {
        compliantVisits++;
      }
    }

    return totalVisits > 0 && compliantVisits === totalVisits ? 'Yes' : 'No';
  } catch (error) {
    console.warn(`Warning: Error getting MCP compliance for ${username}:`, error.message);
    return 'No';
  }
}

module.exports = {
  checkMCPCompliance,
  getUserMCPCompliance,
  PlanVisit
};
