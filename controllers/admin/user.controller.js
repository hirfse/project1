const User = require('../../models/user.model')

exports.getAdminUserManagement = async (req, res) => {
  try {
      const page = parseInt(req.query.page) || 1;
      const limit = 4;
      const skip = (page - 1) * limit;

      const totalUsers = await User.countDocuments();
      const users = await User.find({}).skip(skip).limit(limit);

      const totalPages = Math.ceil(totalUsers / limit);

      res.render('admin/userManagement', {
          users,
          currentPage: page,
          totalPages
      });
  } catch (error) {
      console.error(error);
      res.redirect('/admin/adminHome');
  }
};

exports.blockUser = async (req, res) => {
  try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
          return res.redirect('/admin/userManagement?error=User not found');
      }

      user.status = 'blocked';
      await user.save();

      res.redirect('/admin/userManagement?success=User blocked successfully');
  } catch (error) {
      console.error(error);
      res.redirect('/admin/userManagement?error=Failed to block user');
  }
};

exports.unblockUser = async (req, res) => {
  try {
      const userId = req.params.id;
      const user = await User.findByIdAndUpdate(userId, { status: 'active' });

      if (!user) {
          return res.status(404).send('User not found');
      }

      res.redirect('/admin/userManagement');
  } catch (error) {
      console.error(error);
      res.status(500).send('Error unblocking user');
  }
};

exports.toggleBlockUser = async (req, res) => {
  try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
          return res.status(404).send('User not found');
      }

      user.status = user.status === 'blocked' ? 'active' : 'blocked';
      await user.save();

      // If the user is blocked, destroy their session
      if (user.status === 'blocked' && req.sessionStore) {
          const destroySession = () => {
              return new Promise((resolve, reject) => {
                  req.sessionStore.all((err, sessions) => {
                      if (err) {
                          console.error('Error fetching sessions:', err);
                          return reject(err);
                      }
                      const sessionPromises = [];
                      Object.keys(sessions).forEach(sessionId => {
                          const session = sessions[sessionId];
                          if (session && session.userId === userId.toString()) {
                              sessionPromises.push(new Promise((res, rej) => {
                                  req.sessionStore.destroy(sessionId, err => {
                                      if (err) {
                                          console.error('Error destroying session:', err);
                                          rej(err);
                                      } else {
                                          res();
                                      }
                                  });
                              }));
                          }
                      });
                      Promise.all(sessionPromises)
                          .then(() => resolve())
                          .catch(reject);
                  });
              });
          };

          await destroySession();
      }

      res.redirect('/admin/userManagement?success=User status updated successfully');
  } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).send('Error updating user status');
  }
};

