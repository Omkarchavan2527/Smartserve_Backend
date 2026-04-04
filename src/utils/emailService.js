const nodemailer = require('nodemailer');

// ═══════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════

const templates = {
  appointmentBooked: (data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Appointment Booking Confirmed</h2>
        </div>
        <div class="content">
          <p>Dear ${data.customerName},</p>
          <p>Your appointment has been successfully booked!</p>
          
          <div class="details">
            <h3>Appointment Details:</h3>
            <ul>
              <li><strong>Service:</strong> ${data.serviceName}</li>
              <li><strong>Date:</strong> ${data.scheduledDate}</li>
              <li><strong>Time:</strong> ${data.scheduledStart} - ${data.scheduledEnd}</li>
              <li><strong>Location:</strong> ${data.location}</li>
              <li><strong>Price:</strong> ₹${data.agreedPrice}</li>
              <li><strong>Appointment ID:</strong> #${data.appointmentId}</li>
            </ul>
          </div>
          
          <p>The provider will review and confirm your appointment shortly.</p>
        </div>
        <div class="footer">
          <p>Thank you for choosing our service!</p>
        </div>
      </div>
    </body>
    </html>
  `,
  appointmentBooked: (data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Appointment Booking Confirmed</h2>
        </div>
        <div class="content">
          <p>Dear ${data.customerName},</p>
          <p>Your appointment has been successfully booked!</p>
          
          <div class="details">
            <h3>Appointment Details:</h3>
            <ul>
              <li><strong>Service:</strong> ${data.serviceName}</li>
              <li><strong>Date:</strong> ${data.scheduledDate}</li>
              <li><strong>Time:</strong> ${data.scheduledStart} - ${data.scheduledEnd}</li>
              <li><strong>Location:</strong> ${data.location}</li>
              <li><strong>Price:</strong> ₹${data.agreedPrice}</li>
              <li><strong>Appointment ID:</strong> #${data.appointmentId}</li>
            </ul>
          </div>
          
          <p>The provider will review and confirm your appointment shortly.</p>
        </div>
        <div class="footer">
          <p>Thank you for choosing our service!</p>
        </div>
      </div>
    </body>
    </html>
  `,
  newAppointmentProvider: (data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>New Appointment Booking</h2>
        </div>
        <div class="content">
          <p>Dear ${data.providerName},</p>
          <p>A new appointment has been booked!</p>
          
          <div class="details">
            <h3>Appointment Details:</h3>
            <ul>
            <li><strong>Customer:</strong> ${data.customerName}</li>
              <li><strong>Service:</strong> ${data.serviceName}</li>
              <li><strong>Date:</strong> ${data.scheduledDate}</li>
              <li><strong>Time:</strong> ${data.scheduledStart} - ${data.scheduledEnd}</li>
              <li><strong>Location:</strong> ${data.location}</li>
              <li><strong>Price:</strong> ₹${data.agreedPrice}</li>
              <li><strong>Appointment ID:</strong> #${data.appointmentId}</li>
            </ul>
          </div>
          
          <p>Please confirm your appointment shortly.</p>
        </div>
        <div class="footer">
          <p>Thank you for choosing our service!</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  appointmentAccepted: (data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #2196F3; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>✅ Appointment Accepted</h2>
        </div>
        <div class="content">
          <p>Dear ${data.customerName},</p>
          <p>Great news! Your appointment has been accepted by the provider.</p>
          
          <div class="details">
            <h3>Appointment Details:</h3>
            <ul>
              <li><strong>Service:</strong> ${data.serviceName}</li>
              <li><strong>Date:</strong> ${data.scheduledDate}</li>
              <li><strong>Time:</strong> ${data.scheduledStart} - ${data.scheduledEnd}</li>
              <li><strong>Location:</strong> ${data.location}</li>
              <li><strong>Appointment ID:</strong> #${data.appointmentId}</li>
            </ul>
            ${data.note ? `<p><strong>Provider Note:</strong> ${data.note}</p>` : ''}
          </div>
          
          <p>We look forward to serving you!</p>
        </div>
        <div class="footer">
          <p>Thank you for choosing our service!</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  appointmentCompleted: (data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #FF9800; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>✓ Appointment Completed</h2>
        </div>
        <div class="content">
          <p>Dear ${data.customerName},</p>
          <p>Your appointment has been marked as completed.</p>
          
          <div class="details">
            <h3>Appointment Details:</h3>
            <ul>
              <li><strong>Service:</strong> ${data.serviceName}</li>
              <li><strong>Date:</strong> ${data.scheduledDate}</li>
              <li><strong>Amount:</strong> ₹${data.agreedPrice}</li>
              <li><strong>Appointment ID:</strong> #${data.appointmentId}</li>
            </ul>
            ${data.note ? `<p><strong>Provider Note:</strong> ${data.note}</p>` : ''}
          </div>
          
          <p>Thank you for using our service! We hope to serve you again.</p>
        </div>
        <div class="footer">
          <p>Your feedback helps us improve!</p>
        </div>
      </div>
    </body>
    </html>
  `,
};

// ═══════════════════════════════════════════════════════════
// CREATE TRANSPORTER
// ═══════════════════════════════════════════════════════════

let transporter;

const createTransporter = () => {
  console.log('📧 Creating email transporter...');
  console.log('   Host:', process.env.EMAIL_HOST);
  console.log('   Port:', process.env.EMAIL_PORT);
  console.log('   User:', process.env.EMAIL_USER);
  console.log('   Secure:', process.env.EMAIL_SECURE === 'true');
  
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    // Debug settings
    logger: true, // Log to console
    debug: process.env.NODE_ENV === 'development', // Include SMTP traffic in logs
  });
};

// ═══════════════════════════════════════════════════════════
// SEND EMAIL FUNCTION WITH FULL DEBUGGING
// ═══════════════════════════════════════════════════════════

const sendEmail = async ({ to, subject, template, data }) => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 EMAIL SEND PROCESS STARTED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // ─────────────────────────────────────────────────────────
  // STEP 1: Validate Environment Variables
  // ─────────────────────────────────────────────────────────
  console.log('\n1️⃣ Validating Configuration:');
  
  const requiredEnvVars = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('   ❌ Missing environment variables:', missingVars.join(', '));
    throw new Error(`Missing email configuration: ${missingVars.join(', ')}`);
  }
  
  console.log('   ✅ All required environment variables present');
  console.log('   📝 EMAIL_HOST:', process.env.EMAIL_HOST);
  console.log('   📝 EMAIL_PORT:', process.env.EMAIL_PORT);
  console.log('   📝 EMAIL_USER:', process.env.EMAIL_USER);
  console.log('   📝 EMAIL_FROM:', process.env.EMAIL_FROM);
  
  // ─────────────────────────────────────────────────────────
  // STEP 2: Validate Recipient
  // ─────────────────────────────────────────────────────────
  console.log('\n2️⃣ Validating Recipient:');
  console.log('   To:', to);
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRegex.test(to)) {
    console.error('   ❌ Invalid email address:', to);
    throw new Error('Invalid recipient email address');
  }
  
  console.log('   ✅ Valid email format');
  
  // ─────────────────────────────────────────────────────────
  // STEP 3: Validate Template
  // ─────────────────────────────────────────────────────────
  console.log('\n3️⃣ Validating Template:');
  console.log('   Template:', template);
  console.log('   Available templates:', Object.keys(templates).join(', '));
  
  if (!templates[template]) {
    console.error('   ❌ Template not found:', template);
    throw new Error(`Email template '${template}' does not exist`);
  }
  
  console.log('   ✅ Template found');
  
  // ─────────────────────────────────────────────────────────
  // STEP 4: Generate HTML Content
  // ─────────────────────────────────────────────────────────
  console.log('\n4️⃣ Generating Email Content:');
  
  let html;
  try {
    html = templates[template](data);
    console.log('   ✅ HTML generated');
    console.log('   📏 HTML length:', html.length, 'characters');
  } catch (error) {
    console.error('   ❌ Error generating HTML:', error.message);
    throw error;
  }
  
  // ─────────────────────────────────────────────────────────
  // STEP 5: Create Transporter
  // ─────────────────────────────────────────────────────────
  console.log('\n5️⃣ Creating SMTP Transporter:');
  
  if (!transporter) {
    transporter = createTransporter();
  }
  
  // ─────────────────────────────────────────────────────────
  // STEP 6: Verify Connection (Optional)
  // ─────────────────────────────────────────────────────────
  console.log('\n6️⃣ Verifying SMTP Connection:');
  
  try {
    await transporter.verify();
    console.log('   ✅ SMTP connection verified');
  } catch (error) {
    console.error('   ❌ SMTP connection failed:', error.message);
    console.error('\n   Possible issues:');
    console.error('   - Incorrect EMAIL_HOST or EMAIL_PORT');
    console.error('   - Invalid EMAIL_USER or EMAIL_PASSWORD');
    console.error('   - Firewall blocking SMTP ports');
    console.error('   - 2FA enabled without app password (Gmail)');
    throw error;
  }
  
  // ─────────────────────────────────────────────────────────
  // STEP 7: Prepare Email Message
  // ─────────────────────────────────────────────────────────
  console.log('\n7️⃣ Preparing Email Message:');
  
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'SmartServe'}" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  };
  
  console.log('   From:', mailOptions.from);
  console.log('   To:', mailOptions.to);
  console.log('   Subject:', mailOptions.subject);
  
  // ─────────────────────────────────────────────────────────
  // STEP 8: Send Email
  // ─────────────────────────────────────────────────────────
  console.log('\n8️⃣ Sending Email...');
  
  try {
    const info = await transporter.sendMail(mailOptions);
    
    console.log('\n✅✅✅ EMAIL SENT SUCCESSFULLY! ✅✅✅');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('   Accepted:', info.accepted);
    console.log('   Rejected:', info.rejected);
    
    // Mailtrap preview URL
    if (process.env.EMAIL_HOST?.includes('mailtrap')) {
      console.log('   Preview URL:', nodemailer.getTestMessageUrl(info));
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return info;
  } catch (error) {
    console.error('\n❌❌❌ EMAIL SEND FAILED! ❌❌❌');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Command:', error.command);
    
    console.error('\n🔍 Troubleshooting Steps:');
    console.error('1. Check .env file exists and has correct values');
    console.error('2. Verify EMAIL_USER and EMAIL_PASSWORD are correct');
    console.error('3. For Gmail: Enable 2FA and use App Password');
    console.error('4. Check SMTP host and port are correct');
    console.error('5. Ensure no firewall blocking SMTP ports');
    console.error('6. Check recipient email is valid');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════
// TEST CONNECTION FUNCTION
// ═══════════════════════════════════════════════════════════

const testConnection = async () => {
  console.log('\n🧪 Testing Email Connection...\n');
  
  if (!transporter) {
    transporter = createTransporter();
  }
  
  try {
    await transporter.verify();
    console.log('✅ Email configuration is correct and ready to send emails!\n');
    return true;
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    return false;
  }
};

module.exports = { sendEmail, testConnection };