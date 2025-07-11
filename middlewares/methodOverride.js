const methodOverride = require('method-override');

module.exports = (app) => {
    app.use(methodOverride('_method'));
};