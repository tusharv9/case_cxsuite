// ===== useDepartments HOOK =====

import { useState, useCallback, useEffect } from 'react';
import { departmentService } from '../services/departmentService.js';

export function useDepartments() {
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadDepartments = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await departmentService.getAllDepartments(forceRefresh);
      setDepartments(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  return { departments, isLoading, error, reload: loadDepartments };
}
