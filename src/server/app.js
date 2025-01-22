const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const steamRoutes = require('./routes/steam');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Route for Steam data
app.use('/api/steam', steamRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
