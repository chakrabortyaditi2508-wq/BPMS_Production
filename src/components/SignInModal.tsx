import React from 'react';
import { AuthGateway } from './AuthGateway';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: () => void;
}

export const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  if (!isOpen) return null;

  return (
    <AuthGateway
      isModal
      onClose={onClose}
      initialMode="signin"
      onLoginSuccess={() => {
        if (onLoginSuccess) onLoginSuccess();
        onClose();
      }}
    />
  );
};
