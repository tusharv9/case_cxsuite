// ===== useCustomer HOOK =====

import { useState, useCallback } from 'react';
import { customerService } from '../services/customerService.js';

export function useCustomer() {
  const [customer, setCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCustomer360 = useCallback(async (customerId) => {
    if (!customerService.hasCustomer360Cache(customerId)) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const data = await customerService.getCustomer360(customerId);
      setCustomer(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAllCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await customerService.getAllCustomers();
      setCustomers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { customer, customers, isLoading, error, loadCustomer360, loadAllCustomers };
}
