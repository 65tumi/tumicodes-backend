const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');

router.post('/create-intent', authenticateToken, PaymentController.createPaymentIntent);
router.post('/confirm', authenticateToken, PaymentController.confirmPayment);
router.get('/:id', authenticateToken, PaymentController.getPayment);
router.post('/webhook/simulate', authenticateToken, PaymentController.simulateWebhook);
router.post('/:id/refund', authenticateAdmin, PaymentController.refundPayment);

module.exports = router;