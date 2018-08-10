const axios = require('axios');

axios.post(`http://localhost:${process.env.API_PORT || 3500}/api/backdoor/${process.argv[2]}`, {
  program: 'enter @ "clock" do signal("tick")',
});
