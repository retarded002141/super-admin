import React from 'react';
import '../../stylesheets/Portal/header.css';

export function Header({ title }) {
  return (
    <header className="admin-header">
      <div>
        <h1 className="header-title">{title}</h1>
        <p className="header-subtitle">Overview and management controls</p>
      </div>
    </header>
  );
}