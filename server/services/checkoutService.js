const db = require('../db');
const orderRepository = require('../repositories/orderRepository');

async function placeOrder({ items, email, card, user_id }) {
    const order_id = 'ORD-' + Date.now();

    // PCI-DSS — only the last 4 digits ever touch storage.
    const card_last4 = card.slice(-4);

    // BONUS A — Stock-Check Concurrency.
    // BEGIN IMMEDIATE acquires a RESERVED lock now, so a second concurrent
    // request blocks here until our COMMIT runs. This closes the TOCTOU
    // window between the capacity check (SELECT) and the bookings bump (UPDATE).
    await db.runAsync('BEGIN IMMEDIATE TRANSACTION');
    try {
        const builtItems = [];
        for (const item of items) {
            const workshop = await orderRepository.findWorkshopForCheckout(item.id);

            if (!workshop) throw new Error('WORKSHOP_NOT_FOUND:' + item.id);

            if (workshop.current_bookings + item.quantity > workshop.max_capacity) {
                throw new Error('WORKSHOP_FULL:' + item.id);
            }

            // Gatekeeper Pattern — re-pricing from DB blocks client tampering.
            const unit_price  = workshop.price_current;
            const total_price = unit_price * item.quantity;

            builtItems.push({ workshop_id: item.id, quantity: item.quantity, unit_price, total_price });
        }

        const total = builtItems.reduce((sum, li) => sum + li.total_price, 0);

        const placed_at = new Date().toISOString();
        const order = await orderRepository.insertOrder({
            order_id, user_id, email, card_last4, total, placed_at,
        });

        for (const lineItem of builtItems) {
            await orderRepository.insertOrderItem({ order_id: order.id, ...lineItem });
            await orderRepository.incrementBookings(lineItem.workshop_id, lineItem.quantity);
        }

        await db.runAsync('COMMIT');
        return { order_id, total, items: builtItems, placed_at };
    } catch (err) {
        await db.runAsync('ROLLBACK');
        throw err;
    }
}

module.exports = { placeOrder };
