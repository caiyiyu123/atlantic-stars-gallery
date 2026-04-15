module.exports = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
};
