import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Server, Tag, HardDrive, Subtitles, Copy, Check, Magnet } from 'lucide-react';
import { mediaSourceManager } from '../../services/media/MediaSourceManager';
import './MediaMatchList.css';

export default function MediaMatchList({ matches, subjectId, episodeId }) {
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    const map = new Map();
    for (const match of matches) {
      const sid = match.media.sourceId;
      if (!map.has(sid)) {
        const source = mediaSourceManager.getSource(sid);
        const displayName = source?.info?.displayName || sid;
        const tier = source?.info?.tier ?? 999;
        map.set(sid, { sourceId: sid, displayName, tier, matches: [] });
      }
      map.get(sid).matches.push(match);
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => a.tier - b.tier);
    for (const g of groups) {
      g.matches.sort((a, b) => {
        if (a.matchKind !== b.matchKind) {
          return a.matchKind === 'exact' ? -1 : 1;
        }
        return (a.media.properties?.tier ?? 999) - (b.media.properties?.tier ?? 999);
      });
    }
    return groups;
  }, [matches]);

  const [copiedId, setCopiedId] = useState(null);

  const handleCopyMagnet = (e, magnetUrl, mediaId) => {
    e.stopPropagation();
    navigator.clipboard.writeText(magnetUrl).then(() => {
      setCopiedId(mediaId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handlePlay = (match) => {
    const { sourceId, mediaId } = match.media;
    navigate(`/video/play/${subjectId}/${episodeId}?sourceId=${sourceId}&mediaId=${encodeURIComponent(mediaId)}`);
  };

  if (!matches || matches.length === 0) {
    return <div className="mml-empty">暂无资源</div>;
  }

  return (
    <div className="media-match-list">
      {grouped.map(group => (
        <div key={group.sourceId} className="mml-group">
          <div className="mml-group-header">
            <Server size={14} />
            <span className="mml-group-name">{group.displayName}</span>
            <span className="mml-group-count">{group.matches.length} 条结果</span>
          </div>
          <div className="mml-items">
            {group.matches.map((match, idx) => {
              const isExact = match.matchKind === 'exact';
              const props = match.media.properties || {};
              return (
                <div key={`${match.media.mediaId}_${idx}`} className="mml-item">
                  <div className="mml-item-main">
                    <span className={`mml-match-tag ${isExact ? 'exact' : 'fuzzy'}`}>
                      {isExact ? '精确匹配' : '模糊匹配'}
                    </span>
                    <span className="mml-item-title">{match.media.title}</span>
                  </div>
                  <div className="mml-item-props">
                    {props.resolution && (
                      <span className="mml-prop"><HardDrive size={12} /> {props.resolution}</span>
                    )}
                    {props.subtitleGroup && (
                      <span className="mml-prop"><Subtitles size={12} /> {props.subtitleGroup}</span>
                    )}
                    {props.fileSize && (
                      <span className="mml-prop"><Tag size={12} /> {props.fileSize}</span>
                    )}
                    {props.playSource && (
                      <span className="mml-prop"><Server size={12} /> {props.playSource}</span>
                    )}
                  </div>
                  {match.media.download?.kind === 'magnet' && (
                    <div className="mml-magnet-row">
                      <Magnet size={12} className="mml-magnet-icon" />
                      <span className="mml-magnet-url" title={match.media.download.url}>
                        {match.media.download.url.substring(0, 60)}...
                      </span>
                      <button
                        className="mml-copy-btn"
                        onClick={(e) => handleCopyMagnet(e, match.media.download.url, match.media.mediaId)}
                        title="复制磁力链接"
                      >
                        {copiedId === match.media.mediaId ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}
                  <button
                    className="mml-play-btn"
                    onClick={() => handlePlay(match)}
                    title="播放"
                  >
                    <Play size={14} /> 播放
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
