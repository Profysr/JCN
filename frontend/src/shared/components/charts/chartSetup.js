import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  DoughnutController,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  DoughnutController,
  Filler,
  Tooltip,
  Legend,
);

ChartJS.defaults.font.family = 'inherit';
ChartJS.defaults.animation.duration = 500;
