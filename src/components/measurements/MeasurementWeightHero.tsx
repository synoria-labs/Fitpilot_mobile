import React, { useId, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { AuroraCard, AuroraSegmented } from '../aurora';
import { toSvgId } from '../aurora/AuroraBackdrop';
import { auroraFont, auroraType, useAurora } from '../../theme/aurora';
import { buildMonotonePath, getLineChartDomain } from '../../utils/chartScale';
import {
  describeMeasurementAge,
  formatMeasurementDate,
  formatMeasurementNumber,
  getMeasurementChangeTone,
  type MeasurementChangePreference,
} from '../../utils/measurements';
import {
  selectMeasurementOverviewRange,
  type MeasurementOverviewPoint,
  type MeasurementOverviewRange,
} from '../../utils/measurementOverview';

const RANGES = [
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '1y', label: '1 año' },
  { key: 'all', label: 'Todo' },
] as const;

export function MeasurementWeightHero({
  series,
  preference,
  onCreate,
  onOpen,
}: {
  series: MeasurementOverviewPoint[];
  preference: MeasurementChangePreference;
  onCreate: () => void;
  onOpen: () => void;
}) {
  const aurora = useAurora();
  const violet = aurora.tones.violet;
  const [range, setRange] = useState<MeasurementOverviewRange>('6m');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gradientId = toSvgId(useId());
  const latest = series.at(-1);
  const previous = series.at(-2);
  const age = latest ? describeMeasurementAge(latest.date) : null;
  const change = latest && previous ? latest.value - previous.value : null;
  const changeTone = aurora.tones[getMeasurementChangeTone(change, preference)];
  const visible = useMemo(() => selectMeasurementOverviewRange(series, range), [series, range]);
  const domain = getLineChartDomain(visible.map((point) => point.value));
  const minTime = visible[0]?.timestamp ?? 0;
  const spanTime = (visible.at(-1)?.timestamp ?? 0) - minTime;
  const points = visible.map((point) => ({
    ...point,
    x: spanTime ? 12 + ((point.timestamp - minTime) / spanTime) * 272 : 148,
    y: 132 - ((point.value - domain.min) / (domain.max - domain.min)) * 104,
  }));
  const selected = points.find((point) => point.id === selectedId) ?? points.at(-1);
  const line = buildMonotonePath(points);

  return (
    <AuroraCard elevated radius={28} style={styles.card}>
      <View style={styles.top}>
        <Text style={[styles.eyebrow, { color: aurora.faint }]}>PESO · ÚLTIMA MEDICIÓN</Text>
        {age ? (
          <View
            style={[
              styles.age,
              { backgroundColor: age.isStale ? aurora.tones.amber.soft : violet.soft },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={11}
              color={age.isStale ? aurora.tones.amber.ink : violet.ink}
            />
            <Text
              style={[styles.small, { color: age.isStale ? aurora.tones.amber.ink : violet.ink }]}
            >
              {age.label}
            </Text>
          </View>
        ) : null}
      </View>
      {latest ? (
        <>
          <View style={styles.valueRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver progreso de peso"
              onPress={onOpen}
            >
              <Text style={[styles.value, { color: aurora.text }]}>
                {latest.value.toFixed(1)}
                <Text style={[styles.unit, { color: aurora.faint }]}> {latest.unit}</Text>
              </Text>
            </Pressable>
            {change !== null ? (
              <View style={[styles.change, { backgroundColor: changeTone.soft }]}>
                <Text style={[styles.changeText, { color: changeTone.ink }]}>
                  {change > 0 ? '+' : ''}
                  {formatMeasurementNumber(change, 1)} {latest.unit}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.caption, { color: aurora.faint }]}>
            {formatMeasurementDate(latest.date, 'short')}
            {previous
              ? ` · vs. ${formatMeasurementDate(previous.date, 'short')}`
              : ' · Primera medición'}
          </Text>
          <AuroraSegmented
            options={RANGES}
            value={range}
            onChange={(value) => {
              setRange(value);
              setSelectedId(null);
            }}
            variant="tone"
            tone="violet"
            accessibilityLabel="Periodo de la gráfica de peso"
          />
          {points.length ? (
            <View>
              <View style={styles.chartLabel}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.pointLabel,
                    { backgroundColor: aurora.surface3, color: aurora.text },
                  ]}
                >
                  {selected?.value.toFixed(1)} {selected?.unit} ·{' '}
                  {formatMeasurementDate(selected?.date, 'short')}
                </Text>
              </View>
              <Svg
                width="100%"
                height={170}
                viewBox="0 0 330 160"
                accessibilityLabel="Evolución de peso"
              >
                <Defs>
                  <SvgGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={violet.tone} stopOpacity={0.24} />
                    <Stop offset="1" stopColor={violet.tone} stopOpacity={0.01} />
                  </SvgGradient>
                </Defs>
                {[28, 80, 132].map((y) => (
                  <Line
                    key={y}
                    x1={12}
                    x2={284}
                    y1={y}
                    y2={y}
                    stroke={aurora.border}
                    strokeDasharray="3 4"
                  />
                ))}
                <SvgText x={328} y={30} textAnchor="end" fill={aurora.faint} fontSize={9}>
                  {domain.max.toFixed(1)}
                </SvgText>
                <SvgText x={328} y={134} textAnchor="end" fill={aurora.faint} fontSize={9}>
                  {domain.min.toFixed(1)}
                </SvgText>
                {points.length > 1 ? (
                  <>
                    <Path
                      d={`${line} L ${points.at(-1)!.x} 132 L ${points[0].x} 132 Z`}
                      fill={`url(#${gradientId})`}
                    />
                    <Path d={line} stroke={violet.tone} strokeWidth={2.5} fill="none" />
                  </>
                ) : null}
                {points.map((point) => (
                  <React.Fragment key={point.id}>
                    {point.id === selected?.id ? (
                      <Circle cx={point.x} cy={point.y} r={8} fill={violet.soft} />
                    ) : null}
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={point.id === selected?.id ? 4 : 2.5}
                      fill={aurora.surface}
                      stroke={violet.tone}
                      strokeWidth={1.8}
                    />
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={14}
                      fill="transparent"
                      onPress={() => setSelectedId(point.id)}
                      accessibilityLabel={`${point.value.toFixed(1)} ${point.unit}, ${formatMeasurementDate(point.date, 'short')}`}
                    />
                  </React.Fragment>
                ))}
                <SvgText x={12} y={156} fill={aurora.faint} fontSize={9}>
                  {formatMeasurementDate(points[0].date, 'short')}
                </SvgText>
                {points.length > 1 ? (
                  <SvgText x={284} y={156} textAnchor="end" fill={aurora.faint} fontSize={9}>
                    {formatMeasurementDate(points.at(-1)?.date, 'short')}
                  </SvgText>
                ) : null}
              </Svg>
            </View>
          ) : (
            <Text style={[styles.empty, { color: aurora.faint }]}>
              No hay mediciones en este periodo. Prueba con Todo para ver tu historial.
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.empty, { color: aurora.faint }]}>
          Tu primera medición de peso inicia esta gráfica.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registrar medición"
        onPress={onCreate}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <LinearGradient
          colors={violet.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}
        >
          <Ionicons name="add" size={18} color={aurora.onTone} />
          <Text style={[styles.buttonText, { color: aurora.onTone }]}>Registrar medición</Text>
        </LinearGradient>
      </Pressable>
    </AuroraCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eyebrow: { ...auroraFont('bold'), fontSize: 9, letterSpacing: 1 },
  age: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 9,
  },
  small: { ...auroraFont('bold'), fontSize: 9 },
  valueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  value: {
    ...auroraFont('extrabold'),
    fontSize: 40,
    lineHeight: 49,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  unit: { ...auroraFont('semibold'), fontSize: 16, letterSpacing: 0 },
  change: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  changeText: { ...auroraFont('bold'), fontSize: 11 },
  caption: { ...auroraType.caption, fontSize: 11 },
  chartLabel: { alignItems: 'flex-end', minHeight: 25 },
  pointLabel: {
    ...auroraFont('bold'),
    fontSize: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    overflow: 'hidden',
  },
  empty: { ...auroraType.caption, lineHeight: 19, paddingVertical: 20 },
  button: {
    minHeight: 46,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...auroraFont('bold'), fontSize: 12 },
});
