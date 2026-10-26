import React, { useState, useEffect, useRef } from 'react';
import { Fingerprint, GraduationCap, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { User as AppUser, School } from '../types';
import { NativeBiometric } from '../lib/nativeBiometric';
import { authService } from '../services/authService';
import { disableBiometric } from '../lib/biometricAuthService';
import { getUserFriendlyErrorMessage } from '../utils/errorUtils';

interface BiometricStartupGateProps {
  user: AppUser;
  school: School;
  onSuccess: (user: AppUser) => void;
  onFallbackPassword: () => void;
}

export const BiometricStartupGate: React.FC<BiometricStartupGateProps> = ({
  user,
  school,
  onSuccess,
  onFallbackPassword,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasAutoPrompted = useRef(false);

  const performBiometricAuth = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const authRes = await NativeBiometric.authenticate({
        title: 'Fingerprint Sign In',
        subtitle: `Verify fingerprint to access workspace as ${user.name || user.email}`,
        negativeButtonText: 'Use Password Instead',
      });

      if (authRes.success) {
        // Biometric check succeeded: verify that authoritative Supabase session is still valid
        const confirmedUser = await authService.getSession();
        if (confirmedUser && confirmedUser.id === user.id) {
          onSuccess(confirmedUser);
          return;
        } else {
          // Token revoked or expired in Supabase
          setErrorMessage('Your session has expired. Please sign in with your password.');
          await disableBiometric();
          setTimeout(() => {
            onFallbackPassword();
          }, 1200);
        }
      } else if (authRes.status === 'CANCELLED') {
        // User explicitly pressed 'Use Password Instead' or dismissed prompt
        onFallbackPassword();
        return;
      } else {
        setErrorMessage(authRes.error || 'Fingerprint not recognized. You can try again or use your password.');
      }
    } catch (err: any) {
      setErrorMessage(getUserFriendlyErrorMessage(err, 'Fingerprint authentication encountered an error.'));
    } finally {
      setLoading(false);
    }
  };

  // Automatically trigger native BiometricPrompt once when the gate mounts
  useEffect(() => {
    if (!hasAutoPrompted.current) {
      hasAutoPrompted.current = true;
      const timer = setTimeout(() => {
        performBiometricAuth();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, []);

  const schoolName =
    school?.school_name?.trim() &&
    school.school_name !== 'Muchorwe Comprehensive School' &&
    school.school_name !== 'MUCHORWE COMPREHENSIVE SCHOOL' &&
    school.school_name !== 'Anon Hack'
      ? school.school_name
      : 'CBE HUB';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] text-slate-800 dark:text-slate-200 transition-colors duration-200">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-md space-y-6 relative z-10"
      >
        {/* School Branding */}
        <div className="text-center space-y-3 flex flex-col items-center justify-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#176B45] text-white shadow-lg shadow-[#0F5132]/30 dark:shadow-[#0F5132]/50">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white uppercase">
              {schoolName}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Smarter Management. Better Decisions.
            </p>
          </div>
        </div>

        {/* Biometric Gate Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-2xl dark:shadow-black/50 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 transition-colors duration-200">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 mb-1 shadow-xs">
              <Fingerprint className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Welcome Back
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Verify your fingerprint to unlock your workspace.
            </p>
          </div>

          {/* User Profile Summary */}
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white font-bold flex items-center justify-center text-xs uppercase shrink-0">
              {(user.name || 'User').slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {user.name || 'Teacher'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </p>
            </div>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full capitalize">
              {user.role.replace('_', ' ')}
            </span>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs p-3.5 rounded-xl flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={performBiometricAuth}
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium rounded-xl shadow-lg shadow-emerald-700/20 transition flex items-center justify-center space-x-2 text-sm disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying fingerprint...</span>
                </div>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4" />
                  <span>Touch Fingerprint Sensor</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onFallbackPassword}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Use Password Instead</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
