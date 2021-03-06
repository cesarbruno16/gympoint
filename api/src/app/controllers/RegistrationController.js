import { addMonths, parseISO, subHours } from 'date-fns';
import * as Yup from 'yup';
import Registration from '../models/Registration';
import User from '../models/User';
import Plan from '../models/Plan';
import Student from '../models/Student';

import RegistrationMail from '../jobs/RegistrationMail';
import Queue from '../../lib/Queue';

class RegistrationController {
  async show(req, res) {
    const registration = await Registration.findByPk(req.params.regis_id, {
      attributes: ['id', 'start_date', 'end_date', 'price', 'active'],

      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'title', 'price', 'duration'],
        },
        {
          model: Student,
          as: 'student',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });
    return res.json(registration);
  }

  async index(req, res) {
    const { page = 1 } = req.query;

    const adm = await User.findByPk(req.userId);
    if (!adm) {
      return res
        .status(401)
        .json({ error: 'Somente administradores podem matricular alunos' });
    }
    const registrations = await Registration.findAll({
      attributes: ['id', 'start_date', 'end_date', 'price', 'active'],
      limit: 10,
      offset: (page - 1) * 10,
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'title'],
        },
        {
          model: Student,
          as: 'student',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });
    return res.json(registrations);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      student_id: Yup.number().required(),
      plan_id: Yup.number().required(),
      start_date: Yup.date().required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({
        error: 'Falha na validação dos dados, confira todos os campos',
      });
    }
    const { student_id, plan_id, start_date } = req.body;

    const adm = await User.findByPk(req.userId);
    if (!adm) {
      return res
        .status(401)
        .json({ error: 'Somente administradores podem matricular alunos' });
    }

    const student = await Student.findByPk(student_id);
    if (!student) {
      return res.status(404).json({ error: 'Este estudante não existe' });
    }

    const plan = await Plan.findByPk(plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'Insira um plano valido' });
    }

    const parsedDate = parseISO(start_date);
    if (parsedDate < subHours(new Date(), 3)) {
      return res
        .status(401)
        .json({ error: 'Datas passadas não são permitidas' });
    }

    const registrationExists = await Registration.findOne({
      where: { student_id },
    });

    if (registrationExists) {
      return res
        .status(401)
        .json({ error: 'Este estudante ja possui matricula ativa' });
    }

    const finishedRegist = addMonths(parsedDate, plan.duration);

    const registration = await Registration.create({
      student_id,
      price: plan.price * plan.duration,
      plan_id,
      start_date,
      end_date: finishedRegist,
    });

    await Queue.add(RegistrationMail.key, {
      student,
      finishedRegist,
      plan,
    });

    return res.json(registration);
  }

  async update(req, res) {
    const { student_id, plan_id, start_date } = req.body;

    const adm = await User.findByPk(req.userId);

    if (!adm) {
      return res
        .status(401)
        .json({ error: 'Somente administradores podem matricular alunos' });
    }
    const student = await Student.findByPk(student_id);
    if (!student) {
      return res.status(404).json({ error: 'Esse estudante não existe' });
    }
    const plan = await Plan.findByPk(plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'Este plano não existe' });
    }

    const registration = await Registration.findByPk(req.params.regis_id);
    if (!registration) {
      return res.status(404).json({ error: 'Essa matricula não existe' });
    }
    const parsedDate = parseISO(start_date);
    const finishedRegist = addMonths(parsedDate, plan.duration);

    await registration.update({
      student_id,
      price: plan.price * plan.duration,
      plan_id,
      start_date: parsedDate,
      end_date: finishedRegist,
    });

    return res.json(registration);
  }

  async delete(req, res) {
    const adm = await User.findByPk(req.userId);

    if (!adm) {
      return res
        .status(401)
        .json({ error: 'Somente administradores podem matricular alunos' });
    }
    const registration = await Registration.findByPk(req.params.regis_id, {
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['id', 'name'],
        },
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'title'],
        },
      ],
    });
    if (!registration) {
      return res.status(404).json({ error: 'Essa matricula não existe' });
    }

    await registration.destroy();
    return res.send();
  }
}

export default new RegistrationController();
