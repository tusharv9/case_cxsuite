// ===== CHANNEL BADGE =====
import { Phone, Mail, MessageSquare, MessageCircle, Building2, Share2, HelpCircle } from 'lucide-react';
import './ChannelBadge.css';

export function ChannelBadge({ channel }) {
  const norm = (channel || 'Voice').trim().toLowerCase();

  let icon = <Phone size={13} />;
  let label = channel || 'Voice';
  let badgeClass = 'channel-badge--voice';

  if (norm === 'email') {
    icon = <Mail size={13} />;
    label = 'Email';
    badgeClass = 'channel-badge--email';
  } else if (norm === 'whatsapp') {
    icon = <MessageSquare size={13} />;
    label = 'WhatsApp';
    badgeClass = 'channel-badge--whatsapp';
  } else if (norm === 'sms') {
    icon = <MessageCircle size={13} />;
    label = 'SMS';
    badgeClass = 'channel-badge--sms';
  } else if (norm === 'branch' || norm === 'in person') {
    icon = <Building2 size={13} />;
    label = 'Branch';
    badgeClass = 'channel-badge--branch';
  } else if (norm === 'web chat' || norm === 'webchat') {
    icon = <MessageSquare size={13} />;
    label = 'Web Chat';
    badgeClass = 'channel-badge--webchat';
  } else if (norm === 'social') {
    icon = <Share2 size={13} />;
    label = 'Social';
    badgeClass = 'channel-badge--social';
  } else if (norm === 'phone' || norm === 'voice') {
    icon = <Phone size={13} />;
    label = 'Voice';
    badgeClass = 'channel-badge--voice';
  } else {
    icon = <HelpCircle size={13} />;
    label = channel;
    badgeClass = 'channel-badge--default';
  }

  return (
    <span className={`channel-badge ${badgeClass}`}>
      <span className="channel-badge__icon">{icon}</span>
      <span className="channel-badge__label">{label}</span>
    </span>
  );
}
