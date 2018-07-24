const axios = require('axios');

axios.post(`http://localhost:${process.env.API_URL || 3500}/backdoor/${process.argv[2]}`, {
  program: 'enter @ "clock" do signal("tick")',
});
