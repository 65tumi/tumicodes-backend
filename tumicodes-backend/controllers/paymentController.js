// controllers/paymentController.js - Payment controller
const { PaymentModel, CourseModel, NotificationModel } = require('../models/models');

class PaymentController {
    // Create payment intent
    static async createPaymentIntent(req, res) {
        try {
            const { course_id, amount, currency = 'USD' } = req.body;
            const userId = req.user.id;
            
            // Validate course
            const course = await CourseModel.findById(course_id);
            if (!course || !course.is_published) {
                return res.status(404).json({
                    error: 'Course not found',
                    code: 'COURSE_NOT_FOUND'
                });
            }
            
            // Check if already enrolled
            const isEnrolled = await CourseModel.isUserEnrolled(userId, course_id);
            if (isEnrolled) {
                return res.status(400).json({
                    error: 'Already enrolled in this course',
                    code: 'ALREADY_ENROLLED'
                });
            }
            
            // Create payment record
            const transactionId = `course_${course_id}_user_${userId}_${Date.now()}`;
            const paymentId = await PaymentModel.create({
                user_id: userId,
                course_id: course_id,
                amount: amount || course.price,
                currency,
                status: 'pending',
                payment_method: 'stripe', // Default for now
                payment_gateway: 'stripe',
                transaction_id: transactionId,
                metadata: {
                    course_title: course.title,
                    course_slug: course.slug
                }
            });
            
            // In production, you would integrate with Stripe/PayPal here
            // For now, we'll simulate a payment intent
            const clientSecret = `simulated_client_secret_${transactionId}`;
            
            res.json({
                success: true,
                payment_id: paymentId,
                transaction_id: transactionId,
                client_secret: clientSecret,
                amount: amount || course.price,
                currency
            });
        } catch (error) {
            console.error('Create payment intent error:', error);
            res.status(500).json({
                error: 'Failed to create payment intent',
                code: 'PAYMENT_INTENT_FAILED'
            });
        }
    }
    
    // Confirm payment
    static async confirmPayment(req, res) {
        try {
            const { payment_id, transaction_id } = req.body;
            
            // Find payment
            let payment;
            if (payment_id) {
                payment = await PaymentModel.findById(payment_id);
            } else if (transaction_id) {
                payment = await PaymentModel.findByTransactionId(transaction_id);
            }
            
            if (!payment) {
                return res.status(404).json({
                    error: 'Payment not found',
                    code: 'PAYMENT_NOT_FOUND'
                });
            }
            
            // Verify payment belongs to user (unless admin)
            if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    error: 'Not authorized to confirm this payment',
                    code: 'UNAUTHORIZED'
                });
            }
            
            // Update payment status
            const updatedPayment = await PaymentModel.updateStatus(
                payment.id,
                'completed',
                { confirmed_at: new Date().toISOString() }
            );
            
            // If payment is for a course, enroll user
            if (updatedPayment.course_id && updatedPayment.user_id) {
                const isEnrolled = await CourseModel.isUserEnrolled(
                    updatedPayment.user_id,
                    updatedPayment.course_id
                );
                
                if (!isEnrolled) {
                    await CourseModel.enrollUser(
                        updatedPayment.user_id,
                        updatedPayment.course_id
                    );
                    
                    // Send notification to user
                    await NotificationModel.create({
                        user_id: updatedPayment.user_id,
                        type: 'success',
                        title: 'Payment Successful',
                        message: `You've been enrolled in "${updatedPayment.course_title}"`,
                        icon: 'credit-card'
                    });
                    
                    // Send real-time update
                    if (global.sendToUser) {
                        global.sendToUser(updatedPayment.user_id, 'payment_completed', {
                            payment_id: updatedPayment.id,
                            course_id: updatedPayment.course_id,
                            course_title: updatedPayment.course_title
                        });
                    }
                }
            }
            
            res.json({
                message: 'Payment confirmed successfully',
                payment: updatedPayment
            });
        } catch (error) {
            console.error('Confirm payment error:', error);
            res.status(500).json({
                error: 'Failed to confirm payment',
                code: 'PAYMENT_CONFIRM_FAILED'
            });
        }
    }
    
    // Get payment by ID
    static async getPayment(req, res) {
        try {
            const payment = await PaymentModel.findById(req.params.id);
            if (!payment) {
                return res.status(404).json({
                    error: 'Payment not found',
                    code: 'PAYMENT_NOT_FOUND'
                });
            }
            
            // Verify ownership (unless admin)
            if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    error: 'Not authorized to view this payment',
                    code: 'UNAUTHORIZED'
                });
            }
            
            res.json(payment);
        } catch (error) {
            console.error('Get payment error:', error);
            res.status(500).json({
                error: 'Failed to get payment',
                code: 'PAYMENT_FETCH_FAILED'
            });
        }
    }
    
    // Simulate payment webhook (for testing)
    static async simulateWebhook(req, res) {
        try {
            const { transaction_id, status, gateway_response } = req.body;
            
            if (!transaction_id || !status) {
                return res.status(400).json({
                    error: 'Transaction ID and status are required',
                    code: 'VALIDATION_ERROR'
                });
            }
            
            // Find payment
            const payment = await PaymentModel.findByTransactionId(transaction_id);
            if (!payment) {
                return res.status(404).json({
                    error: 'Payment not found',
                    code: 'PAYMENT_NOT_FOUND'
                });
            }
            
            // Update payment status
            const updatedPayment = await PaymentModel.updateStatus(
                payment.id,
                status,
                gateway_response
            );
            
            // If payment is completed and for a course, enroll user
            if (status === 'completed' && updatedPayment.course_id) {
                const isEnrolled = await CourseModel.isUserEnrolled(
                    updatedPayment.user_id,
                    updatedPayment.course_id
                );
                
                if (!isEnrolled) {
                    await CourseModel.enrollUser(
                        updatedPayment.user_id,
                        updatedPayment.course_id
                    );
                    
                    // Send notification
                    await NotificationModel.create({
                        user_id: updatedPayment.user_id,
                        type: 'success',
                        title: 'Payment Successful',
                        message: `You've been enrolled in "${updatedPayment.course_title}"`,
                        icon: 'credit-card'
                    });
                }
            }
            
            res.json({
                message: 'Webhook processed successfully',
                payment: updatedPayment
            });
        } catch (error) {
            console.error('Simulate webhook error:', error);
            res.status(500).json({
                error: 'Failed to process webhook',
                code: 'WEBHOOK_PROCESS_FAILED'
            });
        }
    }
    
    // Refund payment
    static async refundPayment(req, res) {
        try {
            const payment = await PaymentModel.findById(req.params.id);
            if (!payment) {
                return res.status(404).json({
                    error: 'Payment not found',
                    code: 'PAYMENT_NOT_FOUND'
                });
            }
            
            // Only admin can refund
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    error: 'Admin access required for refunds',
                    code: 'ADMIN_REQUIRED'
                });
            }
            
            // Update payment status
            const updatedPayment = await PaymentModel.updateStatus(payment.id, 'refunded', {
                refunded_at: new Date().toISOString(),
                refunded_by: req.user.id
            });
            
            // Send notification to user
            await NotificationModel.create({
                user_id: payment.user_id,
                type: 'info',
                title: 'Payment Refunded',
                message: `Your payment for "${payment.course_title}" has been refunded.`,
                icon: 'undo'
            });
            
            res.json({
                message: 'Payment refunded successfully',
                payment: updatedPayment
            });
        } catch (error) {
            console.error('Refund payment error:', error);
            res.status(500).json({
                error: 'Failed to refund payment',
                code: 'REFUND_FAILED'
            });
        }
    }
}

module.exports = PaymentController;