const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');


dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const HTTP_STATUS_CODES = {
  OK: 200,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
  NOT_WIN: 444,
  NOT_WP: 433
};

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  insecureAuth: true
});

pool.getConnection()
  .then((connection) => {
    console.log('Connected to database');
    connection.release();
  })
  .catch((err) => {
    console.error('Error connecting to database:', err);
  });

//add columns
app.post('/add-columns', async (req, res, next) => {
    try {
      const connection = await pool.getConnection();
      await connection.query(`
        ALTER TABLE tickets
        ADD Surname VARCHAR(255),
        ADD FirstName VARCHAR(255),
        ADD PhoneNumber VARCHAR(255),
        ADD PhoneNetwork VARCHAR(255),
        ADD IdType VARCHAR(255),
        ADD IdNumber VARCHAR(255),
        ADD AmountPaid DECIMAL(10,2),
        ADD method VARCHAR(255),
       ADD PaidDate_Time DATETIME`);
      connection.release();
  
      return res.status(HTTP_STATUS_CODES.OK).send('New columns added to table.');
    } catch (err) {
      console.error(err);
      return next(err);
    }
  });


// Validate ticket endpoint
app.post('/validate-ticket', async (req, res, next) => {
  try {
    const { ticketNo } = req.body;
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM tickets WHERE TicketNumber = ?', [ticketNo]);
    connection.release();

    if (rows.length === 0) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).send('Ticket does not exist.');
    }

    if (rows[0].Winner === 0) {
      return res.status(HTTP_STATUS_CODES.NOT_WIN).send('Not a winning ticket.');
    }

    if (rows[0].Paid === 1) {
      return res.status(HTTP_STATUS_CODES.NOT_WP).send('Paid winning ticket.');
    }

    return res.status(HTTP_STATUS_CODES.OK).send('Winning ticket not paid.');
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

// Capture pay details endpoint
app.post('/capture-pay-details', async (req, res, next) => {
  try {
    const { Surname, FirstName, PhoneNumber, PhoneNetwork, IdType, IdNumber, AmountPaid	, method, ticket } = req.body;

    // Validate ticket
    const validateRes = await axios.post('http://localhost:5000/validate-ticket', { ticketNo: ticket });
    if (validateRes.status !== HTTP_STATUS_CODES.OK) {
      if (validateRes.status === HTTP_STATUS_CODES.NOT_FOUND) {
        return res.status(HTTP_STATUS_CODES.NOT_FOUND).send('Ticket does not exist.');
      } else if (validateRes.status === HTTP_STATUS_CODES.NOT_WIN) {
        return res.status(HTTP_STATUS_CODES.NOT_WIN).send('Not a winning ticket.');
      } else if (validateRes.status === HTTP_STATUS_CODES.NOT_WP) {
        return res.status(HTTP_STATUS_CODES.NOT_WP).send('Paid winning ticket.');
      } else {
        return res.status(HTTP_STATUS_CODES.SERVER_ERROR).send('An error occurred while validating ticket.');
      }
    }

    // Update ticket payment details
    const connection = await pool.getConnection();
    let updateResult;
    try {
      updateResult = await connection.execute(
        `UPDATE tickets SET 
          Surname = ?, 
          FirstName = ?, 
          PhoneNumber = ?, 
          PhoneNetwork = ?, 
          IdType = ?, 
          IdNumber = ?,
          AmountPaid	= ?, 
          method = ?, 
          Paid = 1, 
          PaidDate_time = NOW() 
        WHERE TicketNumber = ?`,
        [Surname, FirstName, PhoneNumber, PhoneNetwork, IdType, IdNumber,AmountPaid, method, ticket]
      );
    } catch (err) {
      console.error('Error executing update query:', err);
      return res.status(HTTP_STATUS_CODES.SERVER_ERROR).send('An error occurred while updating ticket payment details.');
    } finally {
      connection.release();
    }

    if (updateResult.affectedRows === 0) {
      return res.status(HTTP_STATUS_CODES.SERVER_ERROR).send('An error occurred while updating ticket payment details.');
    }

    return res.status(HTTP_STATUS_CODES.OK).send('Details captured successfully.');
  } catch (err) {
    console.error('Error capturing pay details:', err);
    return res.status(HTTP_STATUS_CODES.SERVER_ERROR).send(err.response.data);

    return next(err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error processing request:', err);
  return res.status(HTTP_STATUS_CODES.SERVER_ERROR).send('An error occurred while processing your request. Please try again.');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

